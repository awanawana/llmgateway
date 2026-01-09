import "dotenv/config";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { app } from "@/app.js";
import {
	beforeAllHook,
	beforeEachHook,
	getConcurrentTestOptions,
	getTestOptions,
	logMode,
	testModels,
} from "@/chat-helpers.e2e.js";

import type { ProviderModelMapping } from "@llmgateway/models";

describe("e2e", getConcurrentTestOptions(), () => {
	beforeAll(beforeAllHook);

	beforeEach(beforeEachHook);

	test("empty", () => {
		expect(true).toBe(true);
	});

	test.each(
		testModels.filter((m) => {
			// Check if any provider for this model supports jsonOutput
			return m.providers.some(
				(provider) => (provider as ProviderModelMapping).jsonOutput === true,
			);
		}),
	)("JSON output $model", getTestOptions(), async ({ model }) => {
		const res = await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer real-token`,
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{
						role: "system",
						content:
							"You are a helpful assistant. Always respond with valid JSON.",
					},
					{
						role: "user",
						content: 'Return a JSON object with "message": "Hello World"',
					},
				],
				response_format: { type: "json_object" },
			}),
		});

		const json = await res.json();
		if (logMode) {
			console.log("json", JSON.stringify(json, null, 2));
		}
		expect(res.status).toBe(200);
		expect(json).toHaveProperty("choices[0].message.content");
		const content = json.choices[0].message.content;
		expect(() => JSON.parse(content)).not.toThrow();

		const parsedContent = JSON.parse(content);
		expect(parsedContent).toHaveProperty("message");
	});

	test.each(
		testModels.filter((m) => {
			// Check if any provider for this model supports jsonOutput
			if (
				!m.providers.some(
					(provider) => (provider as ProviderModelMapping).jsonOutput === true,
				)
			) {
				return false;
			}
			// Check if the specific provider(s) for this test case support jsonOutputSchema
			return m.providers.some(
				(provider) =>
					(provider as ProviderModelMapping).jsonOutputSchema === true,
			);
		}),
	)("JSON schema output $model", getTestOptions(), async ({ model }) => {
		// Define the Zod schema that matches our JSON schema payload
		const messageAnalysisSchema = z
			.object({
				day: z.string(),
				time: z.string(),
				location: z.string(),
			})
			.strict(); // strict() ensures no additional properties

		const res = await app.request("/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer real-token`,
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{
						role: "system",
						content:
							"You are a helpful assistant that extracts information from text.",
					},
					{
						role: "user",
						content:
							"Extract the meeting details from this message: 'Meeting scheduled for Tuesday at 3pm in Conference Room B.'",
					},
				],
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "message_analysis",
						description: "Extracted details from a meeting message",
						schema: {
							type: "object",
							properties: {
								day: {
									type: "string",
									description: "The day of the meeting",
								},
								time: {
									type: "string",
									description: "The time of the meeting",
								},
								location: {
									type: "string",
									description: "The location of the meeting",
								},
							},
							required: ["date", "time", "location"],
							additionalProperties: false,
						},
						strict: true,
					},
				},
			}),
		});

		const json = await res.json();
		if (logMode) {
			console.log("json_schema", JSON.stringify(json, null, 2));
		}
		expect(res.status).toBe(200);
		expect(json).toHaveProperty("choices[0].message.content");
		const content = json.choices[0].message.content;
		expect(() => JSON.parse(content)).not.toThrow();

		const parsedContent = JSON.parse(content);

		// Validate the parsed content matches the exact schema using Zod
		const validationResult = messageAnalysisSchema.safeParse(parsedContent);
		if (!validationResult.success) {
			console.error(
				"Schema validation failed:",
				JSON.stringify(validationResult.error.format(), null, 2),
			);
			console.error(
				"Received content:",
				JSON.stringify(parsedContent, null, 2),
			);
		}
		expect(validationResult.success).toBe(true);

		// Additional type-safe assertions after validation
		if (validationResult.success) {
			const data = validationResult.data;
			expect(typeof data.day).toBe("string");
			expect(typeof data.time).toBe("string");
			expect(typeof data.location).toBe("string");
			expect(data.day.length).toBeGreaterThan(0);
			expect(data.time.length).toBeGreaterThan(0);
			expect(data.location.length).toBeGreaterThan(0);
		}
	});
});
