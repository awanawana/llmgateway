// eslint-disable-next-line import/order
import "dotenv/config";

import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { redisClient } from "@llmgateway/cache";
import { db } from "@llmgateway/db";
import {
	createHonoRequestLogger,
	createRequestLifecycleMiddleware,
} from "@llmgateway/instrumentation";
import { logger } from "@llmgateway/logger";
import { HealthChecker } from "@llmgateway/shared";

import { anthropic } from "./anthropic/anthropic.js";
import { chat } from "./chat/chat.js";
import { tracingMiddleware } from "./middleware/tracing.js";
import { models } from "./models/route.js";

import type { ServerTypes } from "./vars.js";

export const config = {
	servers: [
		{
			url: "https://api.llmgateway.io",
		},
		{
			url: "http://localhost:4001",
		},
	],
	openapi: "3.0.0",
	info: {
		version: "1.0.0",
		title: "LLMGateway API",
	},
	externalDocs: {
		url: "https://docs.llmgateway.io",
		description: "LLMGateway Documentation",
	},
	components: {
		securitySchemes: {
			bearerAuth: {
				type: "http",
				scheme: "bearer",
				description: "Bearer token authentication using API keys",
			},
		},
	},
};

export const app = new OpenAPIHono<ServerTypes>({
	defaultHook: (result, c) => {
		if (!result.success) {
			// Log validation errors for debugging
			logger.warn("Request validation failed", {
				path: c.req.path,
				method: c.req.method,
				errors: result.error.issues,
			});

			// Return OpenAI-compatible error format
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
		return undefined;
	},
});

const honoRequestLogger = createHonoRequestLogger({ service: "gateway" });

const requestLifecycleMiddleware = createRequestLifecycleMiddleware({
	serviceName: "llmgateway-gateway-lifecycle",
});

// Add tracing middleware first so instrumentation stays active for downstream handlers
app.use("*", tracingMiddleware);
app.use("*", requestLifecycleMiddleware);
app.use("*", honoRequestLogger);

app.use(
	"*",
	cors({
		origin: process.env.ORIGIN_URLS?.split(",") || [
			"https://docs.llmgateway.io",
			"http://localhost:3002",
			"http://localhost:3003",
			"http://localhost:3005",
		],
		allowHeaders: ["Content-Type", "Authorization", "Cache-Control"],
		allowMethods: ["POST", "GET", "OPTIONS", "PUT", "PATCH", "DELETE"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

// Middleware to check for application/json content type on POST requests
app.use("*", async (c, next) => {
	if (c.req.method === "POST") {
		const contentType = c.req.header("Content-Type");
		if (!contentType || !contentType.includes("application/json")) {
			throw new HTTPException(415, {
				message:
					"Unsupported Media Type: Content-Type must be application/json",
			});
		}
	}
	return await next();
});

// Middleware to log problematic requests for debugging
app.use("/v1/chat/completions", async (c, next) => {
	if (c.req.method === "POST") {
		// Clone the request to read the body without consuming it
		const clonedRequest = c.req.raw.clone();
		try {
			const body = await clonedRequest.text();
			const bodyObj = JSON.parse(body);

			// Check for common issues
			const hasMessages = "messages" in bodyObj;
			const hasTools = "tools" in bodyObj;
			const toolsValid =
				!hasTools ||
				(Array.isArray(bodyObj.tools) &&
					bodyObj.tools.every((tool: unknown) => {
						return (
							typeof tool === "object" && tool !== null && "function" in tool
						);
					}));

			if (!hasMessages || !toolsValid) {
				logger.warn("Received malformed request", {
					path: c.req.path,
					userAgent: c.req.header("User-Agent"),
					hasMessages,
					hasTools,
					toolsValid,
					bodyKeys: Object.keys(bodyObj),
					toolsStructure: hasTools
						? bodyObj.tools.map((t: unknown) =>
								typeof t === "object" && t !== null ? Object.keys(t) : t,
							)
						: undefined,
				});
			}
		} catch (error) {
			logger.error("Failed to parse request body for logging", error as Error);
		}
	}
	return await next();
});

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		const status = error.status;

		if (status >= 500) {
			logger.error("HTTP 500 exception", error);
		} else {
			logger.warn("HTTP client error", { status, message: error.message });
		}

		return c.json(
			{
				error: true,
				status,
				message: error.message || "An error occurred",
				...(error.res ? { details: error.res } : {}),
			},
			status,
		);
	}

	// For any other errors (non-HTTPException), return 500 Internal Server Error
	logger.error(
		"Unhandled error",
		error instanceof Error ? error : new Error(String(error)),
	);
	return c.json(
		{
			error: true,
			status: 500,
			message: "Internal Server Error",
		},
		500,
	);
});

const root = createRoute({
	summary: "Health check",
	description: "Health check endpoint.",
	operationId: "health",
	method: "get",
	path: "/",
	request: {
		query: z.object({
			skip: z.string().optional().openapi({
				description:
					"Comma-separated list of health checks to skip. Options: redis, database",
				example: "redis,database",
			}),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z
						.object({
							message: z.string(),
							version: z.string(),
							health: z.object({
								status: z.string(),
								redis: z.object({
									connected: z.boolean(),
									error: z.string().optional(),
								}),
								database: z.object({
									connected: z.boolean(),
									error: z.string().optional(),
								}),
							}),
						})
						.openapi({}),
				},
			},
			description: "Health check response.",
		},
		503: {
			content: {
				"application/json": {
					schema: z
						.object({
							message: z.string(),
							version: z.string(),
							health: z.object({
								status: z.string(),
								redis: z.object({
									connected: z.boolean(),
									error: z.string().optional(),
								}),
								database: z.object({
									connected: z.boolean(),
									error: z.string().optional(),
								}),
							}),
						})
						.openapi({}),
				},
			},
			description: "Service unavailable - Redis or database connection failed.",
		},
	},
});

app.openapi(root, async (c) => {
	const { skip } = c.req.valid("query");
	const skipChecks = skip
		? skip.split(",").map((s) => s.trim().toLowerCase())
		: [];

	const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 5000;

	const healthChecker = new HealthChecker({
		redisClient,
		db,
		logger,
	});

	const health = await healthChecker.performHealthChecks({
		skipChecks,
		timeoutMs: TIMEOUT_MS,
	});

	const { response, statusCode } = healthChecker.createHealthResponse(health);

	return c.json(response, statusCode as 200 | 503);
});

const v1 = new OpenAPIHono<ServerTypes>();

v1.route("/chat", chat);
v1.route("/models", models);
v1.route("/messages", anthropic);

app.route("/v1", v1);

app.doc("/json", config);

app.get("/docs", swaggerUI({ url: "/json" }));
