import "dotenv/config";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import {
	beforeAllHook,
	beforeEachHook,
	createProviderKey,
	getConcurrentTestOptions,
	getTestOptions,
	logMode,
} from "@/chat-helpers.e2e.js";
import { waitForLogByRequestId } from "@/test-utils/test-helpers.js";

import { embeddingModels } from "@llmgateway/models";

import { app } from "./app.js";

function generateTestRequestId(): string {
	return `test-embed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const openaiEmbeddingModels = embeddingModels
	.filter((m) => m.family === "openai")
	.map((m) => ({
		model: `openai/${m.id}`,
		modelId: m.id,
		dimensions: m.providers[0]?.dimensions,
		supportsDimensionReduction: m.providers[0]?.supportsDimensionReduction,
	}));

describe("embeddings e2e", getConcurrentTestOptions(), () => {
	beforeAll(async () => {
		await beforeAllHook();

		// Set up OpenAI provider key specifically for embeddings
		const openaiKey = process.env.OPENAI_API_KEY;
		if (openaiKey) {
			await createProviderKey("openai", openaiKey, "api-keys");
		}
	});

	beforeEach(beforeEachHook);

	test("empty", () => {
		expect(true).toBe(true);
	});

	test.each(openaiEmbeddingModels)(
		"basic embedding $model",
		getTestOptions(),
		async ({ model, modelId, dimensions }) => {
			const requestId = generateTestRequestId();
			const res = await app.request("/v1/embeddings", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-request-id": requestId,
					Authorization: `Bearer real-token`,
				},
				body: JSON.stringify({
					model: model,
					input: "The quick brown fox jumps over the lazy dog.",
				}),
			});

			const json = await res.json();
			if (logMode) {
				console.log("response:", JSON.stringify(json, null, 2));
			}

			expect(res.status).toBe(200);

			// Validate response structure
			expect(json).toHaveProperty("object", "list");
			expect(json).toHaveProperty("data");
			expect(json).toHaveProperty("model");
			expect(json).toHaveProperty("usage");

			// Validate data array
			expect(Array.isArray(json.data)).toBe(true);
			expect(json.data.length).toBe(1);
			expect(json.data[0]).toHaveProperty("object", "embedding");
			expect(json.data[0]).toHaveProperty("embedding");
			expect(json.data[0]).toHaveProperty("index", 0);

			// Validate embedding is an array of numbers
			expect(Array.isArray(json.data[0].embedding)).toBe(true);
			expect(json.data[0].embedding.length).toBe(dimensions);
			expect(typeof json.data[0].embedding[0]).toBe("number");

			// Validate usage
			expect(json.usage).toHaveProperty("prompt_tokens");
			expect(json.usage).toHaveProperty("total_tokens");
			expect(typeof json.usage.prompt_tokens).toBe("number");
			expect(json.usage.prompt_tokens).toBeGreaterThan(0);

			// Validate log entry
			const log = await waitForLogByRequestId(requestId);
			if (logMode) {
				console.log("log:", JSON.stringify(log, null, 2));
			}

			expect(log.kind).toBe("embedding");
			expect(log.usedProvider).toBe("openai");
			expect(log.usedModel).toBe(modelId);
			expect(log.finishReason).toBe("stop");
			expect(log.errorDetails).toBeNull();
		},
	);

	test.each(openaiEmbeddingModels.filter((m) => m.supportsDimensionReduction))(
		"dimension reduction $model",
		getTestOptions(),
		async ({ model, modelId }) => {
			const requestId = generateTestRequestId();
			const reducedDimensions = 512;

			const res = await app.request("/v1/embeddings", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-request-id": requestId,
					Authorization: `Bearer real-token`,
				},
				body: JSON.stringify({
					model: model,
					input: "The quick brown fox jumps over the lazy dog.",
					dimensions: reducedDimensions,
				}),
			});

			const json = await res.json();
			if (logMode) {
				console.log("response:", JSON.stringify(json, null, 2));
			}

			expect(res.status).toBe(200);

			// Validate reduced dimensions
			expect(json.data[0].embedding.length).toBe(reducedDimensions);
		},
	);

	test("multiple inputs", getTestOptions(), async () => {
		const requestId = generateTestRequestId();
		const inputs = [
			"The quick brown fox jumps over the lazy dog.",
			"A journey of a thousand miles begins with a single step.",
			"To be or not to be, that is the question.",
		];

		const res = await app.request("/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-request-id": requestId,
				Authorization: `Bearer real-token`,
			},
			body: JSON.stringify({
				model: "openai/text-embedding-3-small",
				input: inputs,
			}),
		});

		const json = await res.json();
		if (logMode) {
			console.log("response:", JSON.stringify(json, null, 2));
		}

		expect(res.status).toBe(200);

		// Validate data array has correct number of embeddings
		expect(json.data.length).toBe(inputs.length);

		// Validate each embedding has correct index
		for (let i = 0; i < inputs.length; i++) {
			expect(json.data[i].index).toBe(i);
			expect(Array.isArray(json.data[i].embedding)).toBe(true);
		}
	});

	test("invalid model returns error", getTestOptions(), async () => {
		const res = await app.request("/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer real-token`,
			},
			body: JSON.stringify({
				model: "gpt-4o", // This is an inference model, not embedding
				input: "Test input",
			}),
		});

		const json = await res.json();
		expect(res.status).toBe(400);
		expect(json).toHaveProperty("error");
		expect(json.error).toHaveProperty("code");
	});

	test("unauthorized request returns error", getTestOptions(), async () => {
		const res = await app.request("/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer invalid-token`,
			},
			body: JSON.stringify({
				model: "openai/text-embedding-3-small",
				input: "Test input",
			}),
		});

		expect(res.status).toBe(401);
	});

	test("missing authorization returns error", getTestOptions(), async () => {
		const res = await app.request("/v1/embeddings", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "openai/text-embedding-3-small",
				input: "Test input",
			}),
		});

		expect(res.status).toBe(401);
	});
});
