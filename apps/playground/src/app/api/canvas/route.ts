import { buildUserPrompt } from "@json-render/core";
import { streamText } from "ai";
import { cookies } from "next/headers";

import { canvasCatalog } from "@/lib/canvas/catalog";
import { getUser } from "@/lib/getUser";

import { createLLMGateway } from "@llmgateway/ai-sdk-provider";

export const maxDuration = 300;

let SYSTEM_PROMPT: string;
try {
	SYSTEM_PROMPT = canvasCatalog.prompt();
} catch (e) {
	console.error("Failed to generate canvas catalog prompt:", e);
	SYSTEM_PROMPT = "";
}

export async function POST(req: Request) {
	const user = await getUser();

	if (!user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
		});
	}

	if (!SYSTEM_PROMPT) {
		return new Response(
			JSON.stringify({ error: "Canvas catalog not initialized" }),
			{ status: 500 },
		);
	}

	const body = await req.json();
	const { prompt, context } = body as {
		prompt: string;
		context?: Record<string, unknown>;
	};

	if (!prompt || typeof prompt !== "string") {
		return new Response(JSON.stringify({ error: "Missing prompt" }), {
			status: 400,
		});
	}

	const cookieStore = await cookies();
	const cookieApiKey =
		cookieStore.get("llmgateway_playground_key")?.value ||
		cookieStore.get("__Host-llmgateway_playground_key")?.value;
	const headerApiKey = req.headers.get("x-llmgateway-key") || undefined;
	const finalApiKey = headerApiKey ?? cookieApiKey;

	if (!finalApiKey) {
		return new Response(JSON.stringify({ error: "Missing API key" }), {
			status: 400,
		});
	}

	const gatewayUrl =
		process.env.GATEWAY_URL ||
		(process.env.NODE_ENV === "development"
			? "http://localhost:4001/v1"
			: "https://api.llmgateway.io/v1");

	const llmgateway = createLLMGateway({
		apiKey: finalApiKey,
		baseURL: gatewayUrl,
		headers: {
			"x-source": "chat.llmgateway.io",
		},
	}) as any;

	// Extract model from context (useUIStream sends it inside context)
	const selectedModel = ((context?.model as string | undefined) ??
		"auto") as string;

	const userPrompt = buildUserPrompt({
		prompt,
		state: context?.state as Record<string, unknown> | undefined,
	});

	try {
		const result = streamText({
			model: llmgateway.chat(selectedModel),
			system: SYSTEM_PROMPT,
			messages: [{ role: "user", content: userPrompt }],
			temperature: 0.7,
		});

		return result.toTextStreamResponse();
	} catch (e) {
		console.error("Canvas streamText error:", e);
		const message = e instanceof Error ? e.message : "Stream failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
		});
	}
}
