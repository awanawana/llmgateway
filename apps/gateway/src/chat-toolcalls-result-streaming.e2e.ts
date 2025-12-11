import "dotenv/config";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { app } from "@/app.js";
import {
	beforeAllHook,
	beforeEachHook,
	generateTestRequestId,
	getConcurrentTestOptions,
	getTestOptions,
	logMode,
	toolCallModels,
	validateLogByRequestId,
} from "@/chat-helpers.e2e.js";
import { readAll } from "@/test-utils/test-helpers.js";

describe("e2e", getConcurrentTestOptions(), () => {
	beforeAll(beforeAllHook);

	beforeEach(beforeEachHook);

	test("empty", () => {
		expect(true).toBe(true);
	});

	test.each(toolCallModels)(
		"streaming tool calls res $model",
		getTestOptions(),
		async ({ model }) => {
			// STEP 1: Make initial streaming request to get tool calls
			const requestId1 = generateTestRequestId();
			const initialRes = await app.request("/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-request-id": requestId1,
					Authorization: `Bearer real-token`,
				},
				body: JSON.stringify({
					model: model,
					messages: [
						{
							role: "system",
							content:
								"You are a weather assistant that can get weather information for cities.",
						},
						{
							role: "user",
							content: "What's the weather like in San Francisco?",
						},
					],
					tools: [
						{
							type: "function",
							function: {
								name: "get_weather",
								description: "Get the current weather for a given city",
								parameters: {
									type: "object",
									properties: {
										city: {
											type: "string",
											description: "The city name to get weather for",
										},
										unit: {
											type: "string",
											enum: ["celsius", "fahrenheit"],
											description: "Temperature unit",
											default: "fahrenheit",
										},
									},
									required: ["city"],
								},
							},
						},
					],
					tool_choice: "auto",
					stream: true,
				}),
			});

			if (initialRes.status !== 200) {
				console.log("Initial response:", await initialRes.text());
				throw new Error(
					`Initial request failed with status ${initialRes.status}`,
				);
			}

			expect(initialRes.status).toBe(200);
			expect(initialRes.headers.get("content-type")).toContain(
				"text/event-stream",
			);

			const streamResult = await readAll(initialRes.body);
			if (logMode) {
				console.log(
					"Initial streaming tool calls response:",
					JSON.stringify(streamResult, null, 2),
				);
			}

			expect(streamResult.hasValidSSE).toBe(true);
			expect(streamResult.eventCount).toBeGreaterThan(0);

			// Find chunks with tool calls
			const toolCallChunks = streamResult.chunks.filter(
				(chunk) => chunk.choices?.[0]?.delta?.tool_calls,
			);
			expect(toolCallChunks.length).toBeGreaterThan(0);

			// Reconstruct the full tool calls from chunks
			const toolCalls: any[] = [];
			for (const chunk of toolCallChunks) {
				const deltaToolCalls = chunk.choices[0].delta.tool_calls;
				for (const deltaToolCall of deltaToolCalls) {
					if (deltaToolCall.index !== undefined) {
						// Initialize tool call if needed
						if (!toolCalls[deltaToolCall.index]) {
							toolCalls[deltaToolCall.index] = {
								id: deltaToolCall.id || "",
								type: deltaToolCall.type || "function",
								function: {
									name: "",
									arguments: "",
								},
							};
						}

						// Accumulate data
						if (deltaToolCall.id) {
							toolCalls[deltaToolCall.index].id = deltaToolCall.id;
						}
						if (deltaToolCall.type) {
							toolCalls[deltaToolCall.index].type = deltaToolCall.type;
						}
						if (deltaToolCall.function) {
							if (deltaToolCall.function.name) {
								toolCalls[deltaToolCall.index].function.name +=
									deltaToolCall.function.name;
							}
							if (deltaToolCall.function.arguments) {
								toolCalls[deltaToolCall.index].function.arguments +=
									deltaToolCall.function.arguments;
							}
						}
					}
				}
			}

			// Verify we got tool calls
			expect(toolCalls.length).toBeGreaterThan(0);
			expect(toolCalls[0].id).toBeTruthy();
			expect(toolCalls[0].function.name).toBe("get_weather");

			if (logMode) {
				console.log(
					"Reconstructed tool calls:",
					JSON.stringify(toolCalls, null, 2),
				);
			}

			// STEP 2: Send tool results back with streaming
			const requestId2 = generateTestRequestId();
			const followupRes = await app.request("/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-request-id": requestId2,
					Authorization: `Bearer real-token`,
				},
				body: JSON.stringify({
					model: model,
					messages: [
						{
							role: "system",
							content:
								"You are a weather assistant that can get weather information for cities.",
						},
						{
							role: "user",
							content: "What's the weather like in San Francisco?",
						},
						{
							role: "assistant",
							content: "",
							tool_calls: toolCalls,
						},
						...toolCalls.map((tc: any) => ({
							role: "tool",
							content: JSON.stringify({
								city: "San Francisco",
								temperature: 72,
								unit: "fahrenheit",
								condition: "Sunny",
							}),
							tool_call_id: tc.id,
						})),
					],
					tools: [
						{
							type: "function",
							function: {
								name: "get_weather",
								description: "Get the current weather for a given city",
								parameters: {
									type: "object",
									properties: {
										city: {
											type: "string",
											description: "The city name to get weather for",
										},
										unit: {
											type: "string",
											enum: ["celsius", "fahrenheit"],
											description: "Temperature unit",
											default: "fahrenheit",
										},
									},
									required: ["city"],
								},
							},
						},
					],
					tool_choice: "auto",
					stream: true,
				}),
			});

			if (followupRes.status !== 200) {
				console.log(
					`Error ${followupRes.status} - streaming tool calls with result response:`,
					await followupRes.text(),
				);
			}

			expect(followupRes.status).toBe(200);
			expect(followupRes.headers.get("content-type")).toContain(
				"text/event-stream",
			);

			const followupStreamResult = await readAll(followupRes.body);
			if (logMode) {
				console.log(
					"Follow-up streaming response:",
					JSON.stringify(followupStreamResult, null, 2),
				);
			}

			expect(followupStreamResult.hasValidSSE).toBe(true);
			expect(followupStreamResult.eventCount).toBeGreaterThan(0);
			expect(followupStreamResult.hasContent).toBe(true);

			// Verify the response contains actual content about the weather
			expect(followupStreamResult.fullContent).toBeTruthy();
			expect(followupStreamResult.fullContent!.length).toBeGreaterThan(0);

			// Validate logs
			const log = await validateLogByRequestId(requestId2);
			expect(log.streamed).toBe(true);

			// Verify we have usage information
			expect(followupStreamResult.hasUsage).toBe(true);
		},
	);
});
