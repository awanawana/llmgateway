import { logger } from "@llmgateway/logger";

import type { Redis } from "ioredis";

export interface SWROptions {
	/** Time in seconds before data becomes stale (default: 30s) */
	staleTime?: number;
	/** Maximum age in seconds to serve stale data (default: 60s) */
	maxAge?: number;
	/** TTL in seconds for negative (null/undefined) results (default: 60s) */
	negativeMaxAge?: number;
}

interface CacheEntry<T> {
	value: T;
	isNegative: boolean;
	cachedAt: number;
}

const DEFAULT_STALE_TIME = 30;
const DEFAULT_MAX_AGE = 60;
const DEFAULT_NEGATIVE_MAX_AGE = 60;

const revalidationInProgress = new Map<string, Promise<unknown>>();

export class SWRCache {
	private readonly redis: Redis;
	private readonly keyPrefix: string;

	constructor(redis: Redis, keyPrefix = "swr:") {
		this.redis = redis;
		this.keyPrefix = keyPrefix;
	}

	async get<T>(
		key: string,
		fetcher: () => Promise<T>,
		options: SWROptions = {},
	): Promise<T> {
		const {
			staleTime = DEFAULT_STALE_TIME,
			maxAge = DEFAULT_MAX_AGE,
			negativeMaxAge = DEFAULT_NEGATIVE_MAX_AGE,
		} = options;

		const cacheKey = this.keyPrefix + key;
		const now = Date.now();

		try {
			const cached = await this.redis.get(cacheKey);

			if (cached) {
				const entry = JSON.parse(cached) as CacheEntry<T>;
				const ageSeconds = (now - entry.cachedAt) / 1000;
				const effectiveMaxAge = entry.isNegative ? negativeMaxAge : maxAge;

				if (ageSeconds <= effectiveMaxAge) {
					if (ageSeconds > staleTime) {
						this.revalidateInBackground(cacheKey, key, fetcher, options);
					}
					return entry.value;
				}
			}
		} catch (error) {
			logger.error(
				"SWR cache read error",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		return await this.fetchAndCache(cacheKey, key, fetcher, options);
	}

	private async fetchAndCache<T>(
		cacheKey: string,
		key: string,
		fetcher: () => Promise<T>,
		options: SWROptions,
	): Promise<T> {
		const {
			maxAge = DEFAULT_MAX_AGE,
			negativeMaxAge = DEFAULT_NEGATIVE_MAX_AGE,
		} = options;

		const existingRevalidation = revalidationInProgress.get(key);
		if (existingRevalidation) {
			return await (existingRevalidation as Promise<T>);
		}

		const fetchPromise = (async () => {
			try {
				const value = await fetcher();
				const isNegative = value === null || value === undefined;
				const ttl = isNegative ? negativeMaxAge : maxAge;

				const entry: CacheEntry<T> = {
					value,
					isNegative,
					cachedAt: Date.now(),
				};

				await this.redis.set(cacheKey, JSON.stringify(entry), "EX", ttl);

				return value;
			} finally {
				revalidationInProgress.delete(key);
			}
		})();

		revalidationInProgress.set(key, fetchPromise);
		return await fetchPromise;
	}

	private revalidateInBackground<T>(
		cacheKey: string,
		key: string,
		fetcher: () => Promise<T>,
		options: SWROptions,
	): void {
		if (revalidationInProgress.has(key)) {
			return;
		}

		const revalidationPromise = (async () => {
			try {
				const {
					maxAge = DEFAULT_MAX_AGE,
					negativeMaxAge = DEFAULT_NEGATIVE_MAX_AGE,
				} = options;

				const value = await fetcher();
				const isNegative = value === null || value === undefined;
				const ttl = isNegative ? negativeMaxAge : maxAge;

				const entry: CacheEntry<T> = {
					value,
					isNegative,
					cachedAt: Date.now(),
				};

				await this.redis.set(cacheKey, JSON.stringify(entry), "EX", ttl);
			} catch (error) {
				logger.error(
					"SWR background revalidation error",
					error instanceof Error ? error : new Error(String(error)),
				);
			} finally {
				revalidationInProgress.delete(key);
			}
		})();

		revalidationInProgress.set(key, revalidationPromise);
	}
}
