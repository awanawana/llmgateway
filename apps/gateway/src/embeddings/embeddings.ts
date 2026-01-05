import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { getProviderEnv } from "@/chat/tools/get-provider-env.js";
import { calculateEmbeddingCosts } from "@/lib/costs.js";
import { calculateDataStorageCost, insertLog } from "@/lib/logs.js";

import { cdb as db, shortid, UnifiedFinishReason } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	embeddingModels,
	getProviderEndpoint,
	getProviderHeaders,
	type ModelDefinition,
	type Provider,
} from "@llmgateway/models";

import type { ServerTypes } from "@/vars.js";

export const embeddings = new OpenAPIHono<ServerTypes>();

const embeddingsRequestSchema = z.object({
	model: z.string().openapi({
		description: "ID of the model to use for embeddings.",
		example: "text-embedding-3-small",
	}),
	input: z
		.union([
			z.string(),
			z.array(z.string()),
			z.array(z.number()),
			z.array(z.array(z.number())),
		])
		.openapi({
			description:
				"Input text to embed, encoded as a string or array of tokens/strings.",
			example: "The quick brown fox jumps over the lazy dog.",
		}),
	encoding_format: z
		.enum(["float", "base64"])
		.optional()
		.default("float")
		.openapi({
			description: "The format to return the embeddings in.",
		}),
	dimensions: z.number().optional().openapi({
		description:
			"The number of dimensions the resulting output embeddings should have. Only supported in text-embedding-3 and later models.",
	}),
	user: z.string().optional().openapi({
		description:
			"A unique identifier representing your end-user, which can help OpenAI to monitor and detect abuse.",
	}),
});

const embeddingsResponseSchema = z.object({
	object: z.literal("list"),
	data: z.array(
		z.object({
			object: z.literal("embedding"),
			embedding: z.union([z.array(z.number()), z.string()]),
			index: z.number(),
		}),
	),
	model: z.string(),
	usage: z.object({
		prompt_tokens: z.number(),
		total_tokens: z.number(),
	}),
});

const embeddingsRoute = createRoute({
	operationId: "v1_embeddings",
	summary: "Create Embeddings",
	description: "Creates an embedding vector representing the input text.",
	method: "post",
	path: "/",
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: embeddingsRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: embeddingsResponseSchema,
				},
			},
			description: "Embedding response.",
		},
	},
});

embeddings.openapi(embeddingsRoute, async (c) => {
	const requestId = c.req.header("x-request-id") || shortid(40);
	const startTime = Date.now();

	// Parse JSON manually
	let rawBody: unknown;
	try {
		rawBody = await c.req.json();
	} catch {
		throw new HTTPException(400, {
			message: "Invalid JSON in request body",
		});
	}

	// Validate against schema
	const validationResult = embeddingsRequestSchema.safeParse(rawBody);
	if (!validationResult.success) {
		throw new HTTPException(400, {
			message: "Invalid request parameters",
		});
	}

	const {
		model: modelInput,
		input,
		encoding_format,
		dimensions,
		user,
	} = validationResult.data;

	c.header("x-request-id", requestId);

	// Extract User-Agent for logging
	const userAgent = c.req.header("User-Agent") || undefined;

	// Check for debug mode
	const debugMode = c.req.header("x-debug") === "true";

	// Store raw request for logging (if debug mode is enabled)
	const rawRequest = debugMode ? rawBody : undefined;

	// Store original requested model
	const initialRequestedModel = modelInput;

	let requestedModel = modelInput;
	let requestedProvider: Provider | undefined;

	// Parse model input for provider/model format
	if (modelInput.includes("/")) {
		const split = modelInput.split("/");
		requestedProvider = split[0] as Provider;
		requestedModel = split.slice(1).join("/");
	}

	// Find the embedding model
	let modelInfo = embeddingModels.find(
		(m) => m.id === requestedModel,
	) as ModelDefinition;

	if (!modelInfo) {
		modelInfo = embeddingModels.find((m) =>
			m.providers.some((p) => p.modelName === requestedModel),
		) as ModelDefinition;
	}

	if (!modelInfo) {
		throw new HTTPException(400, {
			message: `Model ${requestedModel} is not a supported embedding model`,
		});
	}

	// Check model kind
	if (modelInfo.kind !== "embedding") {
		throw new HTTPException(400, {
			message: `Model ${requestedModel} is not an embedding model. Use /v1/chat/completions for inference models.`,
		});
	}

	// Get provider info
	const providerInfo = requestedProvider
		? modelInfo.providers.find((p) => p.providerId === requestedProvider)
		: modelInfo.providers[0];

	if (!providerInfo) {
		throw new HTTPException(400, {
			message: `Provider ${requestedProvider} does not support model ${requestedModel}`,
		});
	}

	const usedProvider = providerInfo.providerId as Provider;
	const usedModel = modelInfo.id;

	// Validate dimensions parameter
	if (dimensions !== undefined) {
		if (!providerInfo.supportsDimensionReduction) {
			throw new HTTPException(400, {
				message: `Model ${requestedModel} does not support dimension reduction`,
			});
		}
		if (providerInfo.maxDimensions && dimensions > providerInfo.maxDimensions) {
			throw new HTTPException(400, {
				message: `Dimensions ${dimensions} exceeds maximum ${providerInfo.maxDimensions} for model ${requestedModel}`,
			});
		}
	}

	// Authenticate
	const auth = c.req.header("Authorization");
	if (!auth) {
		throw new HTTPException(401, {
			message:
				"Unauthorized: No Authorization header provided. Expected 'Bearer your-api-token'",
		});
	}

	const split = auth.split("Bearer ");
	if (split.length !== 2) {
		throw new HTTPException(401, {
			message:
				"Unauthorized: Invalid Authorization header format. Expected 'Bearer your-api-token'",
		});
	}
	const token = split[1];
	if (!token) {
		throw new HTTPException(401, {
			message: "Unauthorized: No token provided",
		});
	}

	const apiKey = await db.query.apiKey.findFirst({
		where: {
			token: {
				eq: token,
			},
		},
	});

	if (!apiKey || apiKey.status !== "active") {
		throw new HTTPException(401, {
			message:
				"Unauthorized: Invalid LLMGateway API token. Please make sure the token is not deleted or disabled.",
		});
	}

	if (apiKey.usageLimit && Number(apiKey.usage) >= Number(apiKey.usageLimit)) {
		throw new HTTPException(401, {
			message: "Unauthorized: LLMGateway API key reached its usage limit.",
		});
	}

	// Get project
	const project = await db.query.project.findFirst({
		where: {
			id: {
				eq: apiKey.projectId,
			},
		},
	});

	if (!project) {
		throw new HTTPException(500, {
			message: "Could not find project",
		});
	}

	if (project.status === "deleted") {
		throw new HTTPException(410, {
			message: "Project has been archived and is no longer accessible",
		});
	}

	// Get organization for retention level
	const organization = await db.query.organization.findFirst({
		where: {
			id: {
				eq: project.organizationId,
			},
		},
	});

	const retentionLevel = organization?.retentionLevel ?? "none";

	// Get provider token - for embeddings we use the simple env-based approach
	// Similar to chat.ts credits mode
	let providerToken: string | undefined;
	let providerKeyId: string | undefined;

	if (project.mode === "api-keys") {
		// Get from database
		const providerKey = await db.query.providerKey.findFirst({
			where: {
				status: {
					eq: "active",
				},
				organizationId: {
					eq: project.organizationId,
				},
				provider: {
					eq: usedProvider,
				},
			},
		});

		if (providerKey) {
			providerToken = providerKey.token;
			providerKeyId = providerKey.id;
		}
	} else if (project.mode === "hybrid") {
		// Try database first, then fall back to env
		const providerKey = await db.query.providerKey.findFirst({
			where: {
				status: {
					eq: "active",
				},
				organizationId: {
					eq: project.organizationId,
				},
				provider: {
					eq: usedProvider,
				},
			},
		});

		if (providerKey) {
			providerToken = providerKey.token;
			providerKeyId = providerKey.id;
		} else {
			// Fall back to env
			try {
				const envResult = getProviderEnv(usedProvider);
				providerToken = envResult.token;
			} catch {
				// No env key available
			}
		}
	} else {
		// credits mode - use env
		try {
			const envResult = getProviderEnv(usedProvider);
			providerToken = envResult.token;
		} catch {
			// No env key available
		}
	}

	const usedMode = providerKeyId ? "api-keys" : "credits";

	if (!providerToken) {
		throw new HTTPException(500, {
			message: `No API key configured for provider ${usedProvider}`,
		});
	}

	// Build request to OpenAI embeddings API
	const embeddingsUrl = getProviderEndpoint(
		usedProvider,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		"embedding",
	);

	const providerHeaders = getProviderHeaders(usedProvider, providerToken);

	const requestBody: Record<string, unknown> = {
		model: providerInfo.modelName,
		input,
	};

	if (encoding_format && encoding_format !== "float") {
		requestBody.encoding_format = encoding_format;
	}

	if (dimensions !== undefined) {
		requestBody.dimensions = dimensions;
	}

	if (user) {
		requestBody.user = user;
	}

	let response: Response;
	let responseData: any;
	let upstreamResponse: any;

	// Store upstream request for logging (if debug mode is enabled)
	const upstreamRequest = debugMode ? requestBody : undefined;

	try {
		response = await fetch(embeddingsUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...providerHeaders,
			},
			body: JSON.stringify(requestBody),
		});

		responseData = await response.json();

		// Store upstream response for logging (if debug mode is enabled)
		upstreamResponse = debugMode ? responseData : undefined;
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error("Embeddings request failed", {
			error: error instanceof Error ? error.message : String(error),
			requestId,
		});

		// Log the failed request
		await insertLog({
			requestId,
			organizationId: project.organizationId,
			projectId: project.id,
			apiKeyId: apiKey.id,
			duration,
			requestedModel: initialRequestedModel,
			requestedProvider: requestedProvider || null,
			usedModel,
			usedProvider,
			responseSize: 0,
			hasError: true,
			errorDetails: {
				statusCode: 500,
				statusText: "Network Error",
				responseText: error instanceof Error ? error.message : String(error),
			},
			finishReason: "gateway_error",
			unifiedFinishReason: UnifiedFinishReason.GATEWAY_ERROR,
			mode: project.mode,
			usedMode,
			kind: "embedding",
			userAgent,
			dataStorageCost: "0",
			rawRequest,
			upstreamRequest,
		});

		throw new HTTPException(500, {
			message: "Failed to connect to embedding provider",
		});
	}

	const duration = Date.now() - startTime;

	if (!response.ok) {
		logger.error("Embeddings provider error", {
			status: response.status,
			error: responseData,
			requestId,
		});

		// Log the error
		await insertLog({
			requestId,
			organizationId: project.organizationId,
			projectId: project.id,
			apiKeyId: apiKey.id,
			duration,
			requestedModel: initialRequestedModel,
			requestedProvider: requestedProvider || null,
			usedModel,
			usedProvider,
			responseSize: JSON.stringify(responseData).length,
			hasError: true,
			errorDetails: {
				statusCode: response.status,
				statusText: response.statusText || "Provider Error",
				responseText: JSON.stringify(responseData),
			},
			finishReason: "upstream_error",
			unifiedFinishReason: UnifiedFinishReason.UPSTREAM_ERROR,
			mode: project.mode,
			usedMode,
			kind: "embedding",
			userAgent,
			dataStorageCost: "0",
			rawRequest,
			upstreamRequest,
			upstreamResponse,
		});

		throw new HTTPException(response.status as 400 | 401 | 500, {
			message:
				responseData?.error?.message ||
				`Embedding provider error: ${response.status}`,
		});
	}

	// Extract usage info
	const promptTokens = responseData.usage?.prompt_tokens || 0;
	const totalTokens = responseData.usage?.total_tokens || 0;

	// Calculate costs
	const costs = calculateEmbeddingCosts(usedModel, usedProvider, promptTokens);

	// Calculate data storage cost
	const dataStorageCost = calculateDataStorageCost(
		promptTokens,
		null,
		null,
		null,
		retentionLevel,
	);

	// Build response with model name including provider
	const finalResponse = {
		object: "list" as const,
		data: responseData.data,
		model: `${usedProvider}/${usedModel}`,
		usage: {
			prompt_tokens: promptTokens,
			total_tokens: totalTokens,
		},
	};

	// Store raw response for logging (if debug mode is enabled)
	const rawResponse = debugMode ? finalResponse : undefined;

	// Log the successful request
	await insertLog({
		requestId,
		organizationId: project.organizationId,
		projectId: project.id,
		apiKeyId: apiKey.id,
		duration,
		requestedModel: initialRequestedModel,
		requestedProvider: requestedProvider || null,
		usedModel,
		usedProvider,
		responseSize: JSON.stringify(responseData).length,
		promptTokens: promptTokens.toString(),
		totalTokens: totalTokens.toString(),
		cost: costs.totalCost,
		inputCost: costs.inputCost,
		estimatedCost: costs.estimatedCost,
		discount: costs.discount,
		finishReason: "stop",
		unifiedFinishReason: UnifiedFinishReason.COMPLETED,
		mode: project.mode,
		usedMode,
		kind: "embedding",
		userAgent,
		dataStorageCost,
		rawRequest,
		rawResponse,
		upstreamRequest,
		upstreamResponse,
	});

	return c.json(finalResponse);
});
