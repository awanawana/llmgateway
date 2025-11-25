import { logger } from "@llmgateway/logger";
import { encrypt, isEncrypted } from "@llmgateway/shared";

import { db, eq, tables } from "./index.js";

/**
 * Migration script to encrypt existing plaintext provider keys
 * This should be run once after deploying the encryption feature
 */
export async function encryptProviderKeys(): Promise<void> {
	logger.info("Starting provider key encryption migration");

	try {
		// Fetch all provider keys
		const allKeys = await db.query.providerKey.findMany({
			where: {
				status: {
					ne: "deleted",
				},
			},
		});

		logger.info(`Found ${allKeys.length} provider keys to check`);

		let encryptedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const key of allKeys) {
			try {
				// Skip if already encrypted
				if (isEncrypted(key.token)) {
					skippedCount++;
					continue;
				}

				// Encrypt the plaintext token
				const encryptedToken = encrypt(key.token);

				// Update the key in the database
				await db
					.update(tables.providerKey)
					.set({
						token: encryptedToken,
					})
					.where(eq(tables.providerKey.id, key.id));

				encryptedCount++;
				logger.info(
					`Encrypted provider key ${key.id} for provider ${key.provider}`,
				);
			} catch (error) {
				errorCount++;
				logger.error(
					`Failed to encrypt provider key ${key.id}`,
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}

		logger.info("Provider key encryption migration completed", {
			total: allKeys.length,
			encrypted: encryptedCount,
			skipped: skippedCount,
			errors: errorCount,
		});

		if (errorCount > 0) {
			throw new Error(
				`Migration completed with ${errorCount} errors. Check logs for details.`,
			);
		}
	} catch (error) {
		logger.error(
			"Provider key encryption migration failed",
			error instanceof Error ? error : new Error(String(error)),
		);
		throw error;
	}
}

// Allow running this script directly
if (import.meta.url === `file://${process.argv[1]}`) {
	encryptProviderKeys()
		.then(() => {
			logger.info("Migration script completed successfully");
			process.exit(0);
		})
		.catch((error) => {
			logger.error("Migration script failed", error);
			process.exit(1);
		});
}
