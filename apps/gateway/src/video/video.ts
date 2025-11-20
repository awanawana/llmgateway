import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { extractCustomHeaders } from "@/chat/tools/extract-custom-headers.js";
import { getProviderEnv } from "@/chat/tools/get-provider-env.js";
import { calculateCosts } from "@/lib/costs.js";
import { throwIamException, validateModelAccess } from "@/lib/iam.js";
import { insertLog } from "@/lib/logs.js";

import { cdb as db, shortid } from "@llmgateway/db";
import { logger } from "@llmgateway/logger";
import {
	hasProviderEnvironmentToken,
	type Model,
	models,
	type Provider,
	providers,
} from "@llmgateway/models";

import type { ServerTypes } from "@/vars.js";

export const video = new OpenAPIHono<ServerTypes>();

const videoGenerationRequestSchema = z.object({
	model: z.string().openapi({
		example: "veo-3.1-generate-preview",
	}),
	prompt: z.string().openapi({
		example: "A serene mountain landscape with flowing waterfalls at sunset",
	}),
	aspect_ratio: z.enum(["16:9", "9:16"]).optional().default("16:9").openapi({
		description: "Aspect ratio of the generated video",
		example: "16:9",
	}),
	duration: z.number().int().min(4).max(8).optional().default(6).openapi({
		description: "Duration of the video in seconds (4, 6, or 8)",
		example: 6,
	}),
	resolution: z.enum(["720p", "1080p"]).optional().default("720p").openapi({
		description: "Resolution of the generated video",
		example: "720p",
	}),
	sample_count: z.number().int().min(1).max(4).optional().default(1).openapi({
		description: "Number of videos to generate",
		example: 1,
	}),
	generate_audio: z.boolean().optional().default(false).openapi({
		description: "Whether to generate audio for the video",
		example: false,
	}),
	negative_prompt: z.string().optional().openapi({
		description: "Text describing what to avoid in the video",
		example: "blurry, low quality",
	}),
	person_generation: z
		.enum(["allow_adult", "dont_allow"])
		.optional()
		.default("allow_adult")
		.openapi({
			description: "Person generation policy",
			example: "allow_adult",
		}),
	seed: z.number().int().optional().openapi({
		description: "Random seed for reproducible generation",
		example: 12345,
	}),
	storage_uri: z.string().optional().openapi({
		description: "Cloud Storage URI to store the output videos",
		example: "gs://bucket/path",
	}),
});

const videoGenerations = createRoute({
	operationId: "v1_video_generations",
	summary: "Video Generations",
	description: "Generate videos from text prompts using AI models",
	method: "post",
	path: "/generations",
	security: [
		{
			bearerAuth: [],
		},
	],
	request: {
		body: {
			content: {
				"application/json": {
					schema: videoGenerationRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						id: z.string(),
						object: z.literal("video.generation"),
						created: z.number(),
						model: z.string(),
						data: z.array(
							z.object({
								url: z.string().optional(),
								b64_json: z.string().optional(),
								duration: z.number(),
								aspect_ratio: z.string(),
								resolution: z.string(),
							}),
						),
						metadata: z.object({
							requested_model: z.string(),
							requested_provider: z.string().nullable(),
							used_model: z.string(),
							used_provider: z.string(),
						}),
					}),
				},
			},
			description: "Video generation response.",
		},
		400: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.object({
							message: z.string(),
							type: z.string(),
							param: z.string().nullable(),
							code: z.string(),
						}),
					}),
				},
			},
			description: "Bad request error.",
		},
		500: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.object({
							message: z.string(),
							type: z.string(),
							param: z.string().nullable(),
							code: z.string(),
						}),
					}),
				},
			},
			description: "Error response object.",
		},
	},
});

video.openapi(videoGenerations, async (c) => {
	const requestId = c.req.header("x-request-id") || shortid(40);
	const startTime = Date.now();

	let rawBody: unknown;
	try {
		rawBody = await c.req.json();
	} catch {
		return c.json(
			{
				error: {
					message: "Invalid JSON in request body",
					type: "invalid_request_error",
					param: null,
					code: "invalid_json",
				},
			},
			400,
		);
	}

	const validationResult = videoGenerationRequestSchema.safeParse(rawBody);
	if (!validationResult.success) {
		return c.json(
			{
				error: {
					message: "Invalid request parameters",
					type: "invalid_request_error",
					param: null,
					code: "invalid_parameters",
				},
			},
			400,
		);
	}

	const {
		model: modelInput,
		prompt,
		aspect_ratio,
		duration,
		resolution,
		sample_count,
		generate_audio,
		negative_prompt,
		person_generation,
		seed,
		storage_uri,
	} = validationResult.data;

	c.header("x-request-id", requestId);

	const customHeaders = extractCustomHeaders(c);

	const initialRequestedModel = modelInput;
	let requestedModel: Model = modelInput as Model;
	let requestedProvider: Provider | undefined;

	if (modelInput.includes("/")) {
		const split = modelInput.split("/");
		const providerCandidate = split[0];
		const knownProvider = providers.find((p) => p.id === providerCandidate);
		if (knownProvider) {
			requestedProvider = providerCandidate as Provider;
		}
		const modelName = split.slice(1).join("/");
		const modelDef = models.find((m) => m.id === modelName);
		if (modelDef) {
			requestedModel = modelDef.id as Model;
		} else {
			throw new HTTPException(400, {
				message: `Requested model ${modelName} not supported`,
			});
		}
	} else {
		const modelDef = models.find((m) => m.id === modelInput);
		if (!modelDef) {
			throw new HTTPException(400, {
				message: `Requested model ${modelInput} not supported`,
			});
		}
		requestedModel = modelDef.id as Model;
	}

	const modelDef = models.find((m) => m.id === requestedModel);
	if (!modelDef) {
		throw new HTTPException(400, {
			message: `Model ${requestedModel} not found`,
		});
	}

	const outputTypes = (modelDef as { output?: string[] }).output;
	if (!outputTypes || !outputTypes.includes("video")) {
		throw new HTTPException(400, {
			message: `Model ${requestedModel} does not support video generation`,
		});
	}

	const providerMapping = requestedProvider
		? modelDef.providers.find((p) => p.providerId === requestedProvider)
		: modelDef.providers[0];

	if (!providerMapping) {
		throw new HTTPException(400, {
			message: `No provider available for model ${requestedModel}`,
		});
	}

	const usedProvider = providerMapping.providerId as Provider;
	const usedModel = providerMapping.modelName;

	const authHeader = c.req.header("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		throw new HTTPException(401, {
			message: "Missing or invalid Authorization header",
		});
	}

	const token = authHeader.substring(7);

	const apiKey = await db.query.apiKey.findFirst({
		where: {
			token: {
				eq: token,
			},
		},
	});

	if (!apiKey || apiKey.status !== "active") {
		throw new HTTPException(401, {
			message: "Invalid API key",
		});
	}

	const project = await db.query.project.findFirst({
		where: {
			id: {
				eq: apiKey.projectId,
			},
		},
	});

	if (!project) {
		throw new HTTPException(401, {
			message: "Project not found",
		});
	}

	const organization = await db.query.organization.findFirst({
		where: {
			id: {
				eq: project.organizationId,
			},
		},
	});

	if (!organization) {
		throw new HTTPException(401, {
			message: "Organization not found",
		});
	}

	const iamCheck = await validateModelAccess(
		apiKey.id,
		requestedModel,
		usedProvider,
	);

	if (!iamCheck.allowed) {
		throwIamException(iamCheck.reason ?? "Access denied");
	}

	let providerToken: string | undefined;
	const providerKeyRecord = await db.query.providerKey.findFirst({
		where: {
			status: {
				eq: "active",
			},
			organizationId: {
				eq: organization.id,
			},
			provider: {
				eq: usedProvider,
			},
		},
	});

	if (providerKeyRecord) {
		providerToken = providerKeyRecord.token;
	} else if (hasProviderEnvironmentToken(usedProvider)) {
		const envTokenData = getProviderEnv(usedProvider);
		providerToken = envTokenData.token;
	}

	if (!providerToken) {
		throw new HTTPException(400, {
			message: `No API key configured for provider ${usedProvider}`,
		});
	}

	let videoData: Array<{
		url?: string;
		b64_json?: string;
		duration: number;
		aspect_ratio: string;
		resolution: string;
	}> = [];
	let finishReason = "completed";
	let hasError = false;
	let errorDetails:
		| {
				statusCode: number;
				statusText: string;
				responseText: string;
		  }
		| undefined;

	try {
		if (usedProvider === "google-vertex") {
			const projectId = process.env.LLM_GOOGLE_CLOUD_PROJECT;
			const region = process.env.LLM_GOOGLE_VERTEX_REGION || "us-central1";

			if (!projectId) {
				throw new HTTPException(500, {
					message: "LLM_GOOGLE_CLOUD_PROJECT environment variable is required",
				});
			}

			const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${usedModel}:predictLongRunning`;

			const requestBody = {
				instances: [
					{
						prompt,
					},
				],
				parameters: {
					aspectRatio: aspect_ratio,
					durationSeconds: duration,
					resolution,
					sampleCount: sample_count,
					generateAudio: generate_audio,
					personGeneration: person_generation,
					...(negative_prompt && { negativePrompt: negative_prompt }),
					...(seed !== undefined && { seed }),
					...(storage_uri && { storageUri: storage_uri }),
				},
			};

			const headers = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${providerToken}`,
			};

			const response = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				logger.error("Google Vertex video generation error", {
					status: response.status,
					error: errorText,
				});
				throw new HTTPException(response.status as 400 | 500, {
					message: `Video generation failed: ${errorText}`,
				});
			}

			const operationResponse = await response.json();
			const operationName = operationResponse.name;

			if (!operationName) {
				throw new HTTPException(500, {
					message: "No operation name returned from video generation",
				});
			}

			const operationEndpoint = `https://${region}-aiplatform.googleapis.com/v1/${operationName}`;
			const maxPollingTime = 300000;
			const pollingInterval = 5000;
			const startPollTime = Date.now();

			while (Date.now() - startPollTime < maxPollingTime) {
				await new Promise<void>((resolve) => {
					setTimeout(resolve, pollingInterval);
				});

				const pollResponse = await fetch(operationEndpoint, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${providerToken}`,
					},
				});

				if (!pollResponse.ok) {
					const errorText = await pollResponse.text();
					logger.error("Google Vertex polling error", {
						status: pollResponse.status,
						error: errorText,
					});
					continue;
				}

				const pollResult = await pollResponse.json();

				if (pollResult.done) {
					if (pollResult.error) {
						throw new HTTPException(500, {
							message: `Video generation failed: ${pollResult.error.message}`,
						});
					}

					const predictions = pollResult.response?.predictions || [];
					videoData = predictions.map((pred: { video?: { uri?: string } }) => ({
						url: pred.video?.uri,
						duration,
						aspect_ratio,
						resolution,
					}));

					if (videoData.length === 0) {
						videoData = [
							{
								url: storage_uri,
								duration,
								aspect_ratio,
								resolution,
							},
						];
					}

					break;
				}
			}

			if (videoData.length === 0) {
				throw new HTTPException(504, {
					message: "Video generation timed out",
				});
			}
		} else {
			throw new HTTPException(400, {
				message: `Provider ${usedProvider} does not support video generation`,
			});
		}
	} catch (error) {
		hasError = true;
		if (error instanceof HTTPException) {
			finishReason = "upstream_error";
			errorDetails = {
				statusCode: error.status,
				statusText: "Error",
				responseText: error.message,
			};
			throw error;
		}
		finishReason = "gateway_error";
		errorDetails = {
			statusCode: 500,
			statusText: "Internal Server Error",
			responseText: error instanceof Error ? error.message : "Unknown error",
		};
		throw new HTTPException(500, {
			message: "Video generation failed",
		});
	} finally {
		const endTime = Date.now();
		const durationMs = endTime - startTime;

		const mode = project.mode || "credits";
		const usedMode = providerKeyRecord ? "api-keys" : "credits";

		const promptTokens = Math.round(prompt.length / 4);
		const completionTokens = duration * 30;

		const costs = calculateCosts(
			requestedModel,
			usedProvider,
			promptTokens,
			completionTokens,
			0,
		);

		await insertLog({
			requestId,
			organizationId: organization.id,
			projectId: project.id,
			apiKeyId: apiKey.id,
			duration: durationMs,
			requestedModel: initialRequestedModel,
			requestedProvider: requestedProvider || null,
			usedModel,
			usedProvider,
			responseSize: JSON.stringify(videoData).length,
			content: videoData[0]?.url || null,
			finishReason,
			promptTokens: String(promptTokens),
			completionTokens: String(completionTokens),
			totalTokens: String(promptTokens + completionTokens),
			messages: [{ role: "user", content: prompt }],
			hasError,
			errorDetails,
			cost: costs.totalCost,
			inputCost: costs.inputCost,
			outputCost: costs.outputCost,
			cachedInputCost: 0,
			requestCost: 0,
			estimatedCost: true,
			discount: costs.discount,
			mode,
			usedMode,
			customHeaders,
		});
	}

	return c.json(
		{
			id: `vidgen-${requestId}`,
			object: "video.generation" as const,
			created: Math.floor(Date.now() / 1000),
			model: `${usedProvider}/${usedModel}`,
			data: videoData,
			metadata: {
				requested_model: initialRequestedModel,
				requested_provider: requestedProvider || null,
				used_model: usedModel,
				used_provider: usedProvider,
			},
		},
		200,
	);
});
