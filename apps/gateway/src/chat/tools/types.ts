export const DEFAULT_TOKENIZER_MODEL = "gpt-4";

// Define ChatMessage type to match what gpt-tokenizer expects
export interface ChatMessage {
	role: "user" | "system" | "assistant" | undefined;
	content: string;
	name?: string;
}

/**
 * Extracts text content from a message content field, handling both string and array formats
 * This function is necessary because BaseMessage.content can be string | MessageContent[]
 * but gpt-tokenizer expects only strings
 */
export function extractTextFromMessageContent(content: string | any[]): string {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.filter((part: any) => part.type === "text")
			.map((part: any) => part.text || "")
			.join(" ");
	}

	return "";
}

// Define OpenAI-compatible image object type
export interface ImageObject {
	type: "image_url";
	image_url: {
		url: string;
	};
}

// Define tool call object type
export interface ToolCall {
	id: string;
	type: "function";
	index: number;
	function: {
		name: string;
		arguments: string;
	};
}

// Define streaming delta object type
export interface StreamingDelta {
	role?: "assistant";
	content?: string;
	images?: ImageObject[];
	tool_calls?: ToolCall[];
}
