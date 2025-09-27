"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const API_KEY_STORAGE_KEY = "llmgateway_user_api_key";
const API_KEY_CHANGED_EVENT = "llmgateway_api_key_changed";
const GITHUB_TOKEN_STORAGE_KEY = "llmgateway_github_token";
const GITHUB_TOKEN_CHANGED_EVENT = "llmgateway_github_token_changed";

export function useApiKey() {
	const [apiKey, setApiKey] = useState<string | null>(null);
	const [githubToken, setGithubToken] = useState<string | null>(null);
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		const syncKey = () => {
			try {
				const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
				setApiKey(storedKey);
				const gh = localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY);
				setGithubToken(gh);
			} catch {
				toast.error("Failed to sync API key from localStorage");
			}
		};

		// Initial sync
		syncKey();
		setIsLoaded(true);

		// Listen for changes from other tabs/windows
		window.addEventListener("storage", syncKey);
		// Listen for changes from the same tab
		window.addEventListener(API_KEY_CHANGED_EVENT, syncKey);
		window.addEventListener(GITHUB_TOKEN_CHANGED_EVENT, syncKey);

		return () => {
			window.removeEventListener("storage", syncKey);
			window.removeEventListener(API_KEY_CHANGED_EVENT, syncKey);
			window.removeEventListener(GITHUB_TOKEN_CHANGED_EVENT, syncKey);
		};
	}, []); // Run once on mount

	const setUserApiKey = useCallback((key: string) => {
		try {
			localStorage.setItem(API_KEY_STORAGE_KEY, key);
			window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
		} catch (error) {
			toast.error("Failed to save API key to localStorage");
			throw error;
		}
	}, []);

	const clearUserApiKey = useCallback(() => {
		try {
			localStorage.removeItem(API_KEY_STORAGE_KEY);
			window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
		} catch {
			toast.error("Failed to clear API key from localStorage");
		}
	}, []);

	const setGithubMcpToken = useCallback((token: string) => {
		try {
			localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token);
			window.dispatchEvent(new Event(GITHUB_TOKEN_CHANGED_EVENT));
		} catch (error) {
			toast.error("Failed to save GitHub token to localStorage");
			throw error;
		}
	}, []);

	const clearGithubMcpToken = useCallback(() => {
		try {
			localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
			window.dispatchEvent(new Event(GITHUB_TOKEN_CHANGED_EVENT));
		} catch {
			toast.error("Failed to clear GitHub token from localStorage");
		}
	}, []);

	return {
		userApiKey: apiKey,
		githubToken,
		isLoaded,
		setUserApiKey,
		clearUserApiKey,
		setGithubMcpToken,
		clearGithubMcpToken,
	};
}
