"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, Key, KeyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useState, useEffect, useCallback } from "react";

import { useDefaultProject } from "@/hooks/useDefaultProject";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/lib/components/button";
import { Step } from "@/lib/components/stepper";
import { toast } from "@/lib/components/use-toast";
import { useAppConfig } from "@/lib/config";
import { useApi } from "@/lib/fetch-client";

export function WelcomeStep() {
	const router = useRouter();
	const config = useAppConfig();
	const { user } = useUser();
	const { data: defaultProject } = useDefaultProject();

	const api = useApi();
	const queryClient = useQueryClient();

	const [apiKey, setApiKey] = useState<string | null>(null);

	const isLocalhost = !config.hosted;

	const createApiKeyMutation = api.useMutation("post", "/keys/api");
	const completeOnboarding = api.useMutation(
		"post",
		"/user/me/complete-onboarding",
	);

	// Fetch existing API keys to check if one already exists
	const { data: existingKeys, refetch: refetchKeys } = api.useQuery(
		"get",
		"/keys/api",
		{
			params: {
				query: { projectId: defaultProject?.id || "" },
			},
		},
		{
			enabled: !!defaultProject?.id && !!user, // Only fetch if user is authenticated
			staleTime: 0, // Always fetch fresh data
			refetchOnWindowFocus: true,
			refetchOnMount: true,
		},
	);

	// Refetch API keys when component mounts to get fresh data
	useEffect(() => {
		if (defaultProject?.id && user) {
			refetchKeys();
		}
	}, [defaultProject?.id, user, refetchKeys]);

	// Also invalidate cache on mount to ensure fresh data
	useEffect(() => {
		if (defaultProject?.id) {
			const queryKey = api.queryOptions("get", "/keys/api", {
				params: {
					query: { projectId: defaultProject.id },
				},
			}).queryKey;
			queryClient.invalidateQueries({ queryKey });
		}
	}, [defaultProject?.id, api, queryClient]);

	const createApiKey = useCallback(async () => {
		// Security: Multiple authentication checks
		if (!user) {
			console.error("Unauthorized: No user session");
			toast({
				title: "Authentication Error",
				description: "Please sign in to create API keys.",
				variant: "destructive",
			});
			return;
		}

		if (!defaultProject?.id) {
			console.error("Unauthorized: No project access");
			toast({
				title: "Access Error",
				description: "No project found. Please contact support.",
				variant: "destructive",
			});
			return;
		}

		try {
			const response = await createApiKeyMutation.mutateAsync({
				body: {
					description: "GATEWAY-001",
					projectId: defaultProject.id,
					usageLimit: null,
				},
			});
			setApiKey(response.apiKey.token);

			// Invalidate API keys cache to ensure other components see the new key
			const queryKey = api.queryOptions("get", "/keys/api", {
				params: {
					query: { projectId: defaultProject.id },
				},
			}).queryKey;
			queryClient.invalidateQueries({ queryKey });
		} catch {
			toast({
				title: "Error",
				description:
					"Failed to create API key. We'll help you create one in the next step.",
				variant: "destructive",
			});
		}
	}, [user, defaultProject?.id, createApiKeyMutation, api, queryClient]);

	// Auto-create API key on component mount only if no existing keys
	useEffect(() => {
		// Security: Only proceed if user is authenticated
		if (!user) {
			return;
		}

		// Don't create keys if we're still loading existing keys data
		if (existingKeys === undefined) {
			return;
		}

		const hasExistingKeys =
			existingKeys?.apiKeys && existingKeys.apiKeys.length > 0;
		const shouldCreateKey =
			defaultProject?.id &&
			!apiKey &&
			!createApiKeyMutation.isPending &&
			!hasExistingKeys;

		if (shouldCreateKey) {
			createApiKey();
		}
	}, [
		user,
		defaultProject?.id,
		apiKey,
		createApiKeyMutation.isPending,
		createApiKey,
		existingKeys,
	]);

	const copyToClipboard = () => {
		if (apiKey) {
			navigator.clipboard.writeText(apiKey);
			toast({
				title: "Copied to clipboard",
				description: "API key copied to clipboard",
			});
		}
	};

	// Security: Ensure user is authenticated before proceeding
	if (!user) {
		return (
			<Step>
				<div className="flex flex-col gap-6 text-center">
					<h1 className="text-2xl font-bold">Authentication Required</h1>
					<p className="text-muted-foreground">
						Please sign in to continue with the onboarding process.
					</p>
				</div>
			</Step>
		);
	}

	return (
		<Step>
			<div className="space-y-8">
				{/* Hero Section */}
				<div className="text-center space-y-3">
					<h1 className="text-3xl font-semibold tracking-tight">
						Welcome to LLM Gateway
					</h1>
					<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
						{isLocalhost
							? `You're all set up for self-hosting! ${!existingKeys?.apiKeys?.length ? "Let's get you connected to the platform with your first API key." : ""}`
							: `${existingKeys?.apiKeys?.length ? "You can skip this step and go to the dashboard to manage your API keys." : "Let's get you connected to the platform with your first API key."}`}
					</p>
				</div>

				{/* API Key Status Card/Alert */}
				{(apiKey ||
					createApiKeyMutation.isPending ||
					(existingKeys?.apiKeys && existingKeys.apiKeys.length > 0)) && (
					<div
						className={`rounded-xl border-2 p-4 ${
							apiKey ||
							(existingKeys?.apiKeys && existingKeys.apiKeys.length > 0)
								? "border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:border-green-800 dark:from-green-950 dark:to-emerald-950"
								: "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-800 dark:from-blue-950 dark:to-indigo-950"
						}`}
					>
						<div className="flex flex-col items-center md:items-start md:flex-row gap-4">
							<div
								className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
									apiKey ||
									(existingKeys?.apiKeys && existingKeys.apiKeys.length > 0)
										? "bg-green-100 dark:bg-green-900"
										: "bg-blue-100 dark:bg-blue-900"
								}`}
							>
								{apiKey ||
								(existingKeys?.apiKeys && existingKeys.apiKeys.length > 0) ? (
									<KeyIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
								) : (
									<Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
								)}
							</div>
							<div className="flex-1 min-w-0">
								<h2 className="text-xl font-medium mb-2 text-green-900 dark:text-green-100 text-center md:text-left">
									{apiKey
										? "Your API key is ready!"
										: existingKeys?.apiKeys && existingKeys.apiKeys.length > 0
											? "You can already access models through LLM Gateway"
											: "Creating your API key..."}
								</h2>

								{apiKey ? (
									<div className="space-y-3">
										<div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
											<div className="flex items-center justify-between gap-3">
												<code className="text-sm font-mono break-all text-slate-900 dark:text-slate-100">
													{apiKey || "Generating API key..."}
												</code>
												<Button
													variant="outline"
													size="sm"
													onClick={copyToClipboard}
													className="flex-shrink-0"
												>
													<Copy className="h-4 w-4 mr-2" />
													Copy
												</Button>
											</div>
											<p className="text-xs text-slate-500 dark:text-slate-500 pt-1">
												Copy and store this key securely. You won't be able to
												see it again. Check the docs on how to use it.
											</p>
										</div>
									</div>
								) : existingKeys?.apiKeys && existingKeys.apiKeys.length > 0 ? (
									<div className="space-y-2">
										<p className="text-slate-600 dark:text-slate-400 text-center md:text-left">
											You have {existingKeys.apiKeys.length} API key
											{existingKeys.apiKeys.length > 1 ? "s" : ""} configured
											and ready to use. You can manage{" "}
											{existingKeys.apiKeys.length > 1 ? "them" : "it"} in the
											dashboard.
										</p>
										{defaultProject && (
											<p className="text-xs text-slate-500 dark:text-slate-500">
												Keys are counted from your default project:{" "}
												<code className="bg-slate-100 dark:bg-slate-800 p-1 rounded-sm border border-slate-200 dark:border-slate-600 text-current">
													{defaultProject.name}
												</code>
											</p>
										)}
									</div>
								) : (
									<p className="text-slate-600 dark:text-slate-400">
										Setting up your first API key to get started...
									</p>
								)}
							</div>
						</div>
					</div>
				)}

				{/* Skip Setup Option for Existing Users */}
				{existingKeys?.apiKeys &&
					existingKeys.apiKeys.length > 1 &&
					!apiKey && (
						<div className="mt-6 text-center">
							<Button
								variant="outline"
								onClick={async () => {
									try {
										await completeOnboarding.mutateAsync({});
										const queryKey = api.queryOptions(
											"get",
											"/user/me",
										).queryKey;
										await queryClient.invalidateQueries({ queryKey });
										router.push("/dashboard");
									} catch (error) {
										console.error("Failed to complete onboarding:", error);
										toast({
											title: "Error",
											description:
												"Failed to complete onboarding. Please try again.",
											variant: "destructive",
										});
									}
								}}
								disabled={completeOnboarding.isPending}
							>
								{completeOnboarding.isPending
									? "Completing..."
									: "Skip setup, go to dashboard"}
							</Button>
						</div>
					)}
			</div>
		</Step>
	);
}
