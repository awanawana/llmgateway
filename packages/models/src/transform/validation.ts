import { models } from "@/packages/models/src/models";

import { logger } from "@llmgateway/logger";

import { getProviderEndpoint } from "./endpoint";
import { getProviderHeaders } from "./headers";
import { prepareRequestBody } from "./request-body";

import type { ProviderModelMapping } from "@/packages/models/src/models";
import type { ProviderId } from "@/packages/models/src/providers";
import type {
	BaseMessage,
	ProviderValidationResult,
} from "@/packages/models/src/types";

/**
 * Get the cheapest model for a given provider based on input + output pricing
 */
function getCheapestModelForProvider(provider: ProviderId): string | null {
	const availableModels = models
		.filter((model) => model.providers.some((p) => p.providerId === provider))
		.filter((model) => !model.deprecatedAt || new Date() <= model.deprecatedAt)
		.map((model) => ({
			model: model.id,
			provider: model.providers.find((p) => p.providerId === provider)!,
		}))
		.filter(
			({ provider: providerInfo }) =>
				providerInfo.inputPrice !== undefined &&
				providerInfo.outputPrice !== undefined,
		);

	if (availableModels.length === 0) {
		return null;
	}

	let cheapestModel = availableModels[0].provider.modelName;
	let lowestPrice = Number.MAX_VALUE;

	for (const { provider: providerInfo } of availableModels) {
		const totalPrice =
			(providerInfo.inputPrice! + providerInfo.outputPrice!) / 2;
		if (totalPrice < lowestPrice) {
			lowestPrice = totalPrice;
			cheapestModel = providerInfo.modelName;
		}
	}

	return cheapestModel;
}

/**
 * Validate a provider API key by making a minimal request
 */
export async function validateProviderKey(
	provider: ProviderId,
	token: string,
	baseUrl?: string,
	skipValidation = false,
): Promise<ProviderValidationResult> {
	// Skip validation if requested (e.g. in test environment)
	if (skipValidation) {
		return { valid: true };
	}

	// Skip validation for custom providers since they don't have predefined models
	if (provider === "custom") {
		return { valid: true };
	}

	try {
		const endpoint = getProviderEndpoint(
			provider,
			baseUrl,
			undefined,
			provider === "google-ai-studio" ? token : undefined,
			false, // validation doesn't need streaming
			false, // supportsReasoning - disable for validation
			false, // hasExistingToolCalls - disable for validation
		);

		// Use prepareRequestBody to create the validation payload
		const systemMessage: BaseMessage = {
			role: "system",
			content: "You are a helpful assistant.",
		};
		const minimalMessage: BaseMessage = {
			role: "user",
			content: "Hello",
		};
		const messages: BaseMessage[] = [systemMessage, minimalMessage];

		const validationModel = getCheapestModelForProvider(provider);

		logger.debug("Using validation model", {
			provider,
			validationModel: validationModel || undefined,
		});
		if (!validationModel) {
			throw new Error(
				`No model with pricing information found for provider ${provider}`,
			);
		}

		// Find the model definition and check if max_tokens is supported
		const modelDef = models.find((m) =>
			m.providers.some(
				(p) => p.providerId === provider && p.modelName === validationModel,
			),
		);
		const providerMapping = modelDef?.providers.find(
			(p) => p.providerId === provider && p.modelName === validationModel,
		);
		const supportedParameters = (
			providerMapping as ProviderModelMapping | undefined
		)?.supportedParameters;
		const supportsMaxTokens =
			supportedParameters?.includes("max_tokens") ?? true;

		const payload = await prepareRequestBody(
			provider,
			validationModel,
			messages,
			false, // stream
			undefined, // temperature
			supportsMaxTokens ? 1 : undefined, // max_tokens - minimal for validation, undefined if not supported
			undefined, // top_p
			undefined, // frequency_penalty
			undefined, // presence_penalty
			undefined, // response_format
			undefined, // tools
			undefined, // tool_choice
			undefined, // reasoning_effort
			false, // supportsReasoning - disable for validation
			false, // isProd - allow http URLs for validation/testing
		);

		const headers = getProviderHeaders(provider, token);
		headers["Content-Type"] = "application/json";

		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			let errorMessage = `Error from provider: ${response.status} ${response.statusText}`;

			try {
				const errorJson = JSON.parse(errorText);
				if (errorJson.error?.message) {
					errorMessage = errorJson.error.message;
				} else if (errorJson.message) {
					errorMessage = errorJson.message;
				}
			} catch {}

			if (response.status === 401) {
				return {
					valid: false,
					statusCode: response.status,
				};
			}

			return { valid: false, error: errorMessage, statusCode: response.status };
		}

		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Unknown error occurred",
		};
	}
}
