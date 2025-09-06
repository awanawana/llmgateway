import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

interface ChatMessage {
	role: string;
	content:
		| string
		| Array<
				| { type: "text"; text: string }
				| {
						type: "image_url";
						image_url: { url: string; detail?: "low" | "high" | "auto" };
				  }
		  >;
	name?: string;
	tool_call_id?: string;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
}

export interface CompressionOptions {
	targetTokens: number;
	embeddingsApiKey?: string;
}

export class ContextCompressor {
	private embeddings: OpenAIEmbeddings;
	private textSplitter: RecursiveCharacterTextSplitter;

	public constructor(apiKey?: string) {
		this.embeddings = new OpenAIEmbeddings({
			openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
			modelName: "text-embedding-3-small",
		});

		this.textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: 500,
			chunkOverlap: 50,
		});
	}

	private extractTextContent(
		content: string | Array<{ type: string; text?: string; image_url?: any }>,
	): string {
		if (typeof content === "string") {
			return content;
		}

		return content
			.filter((item) => item.type === "text" && item.text)
			.map((item) => item.text)
			.join(" ");
	}

	private estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}

	public async compressMessages(
		messages: ChatMessage[],
		options: CompressionOptions,
	): Promise<ChatMessage[]> {
		if (messages.length === 0) {
			return messages;
		}

		const systemMessages = messages.filter((msg) => msg.role === "system");
		const userMessages = messages.filter((msg) => msg.role === "user");

		const allContent = messages
			.map((msg) => ({
				role: msg.role,
				content: this.extractTextContent(msg.content),
				originalMessage: msg,
			}))
			.filter((msg) => msg.content.length > 0);

		const currentTokens = allContent.reduce(
			(sum, msg) => sum + this.estimateTokens(msg.content),
			0,
		);

		if (currentTokens <= options.targetTokens) {
			return messages;
		}

		const documents = allContent.map(
			(msg) =>
				new Document({
					pageContent: `${msg.role}: ${msg.content}`,
					metadata: { role: msg.role, originalMessage: msg.originalMessage },
				}),
		);

		const splitDocs = await this.textSplitter.splitDocuments(documents);

		const vectorStore = await MemoryVectorStore.fromDocuments(
			splitDocs,
			this.embeddings,
		);

		const lastUserMessage = userMessages[userMessages.length - 1];
		const queryText = lastUserMessage
			? this.extractTextContent(lastUserMessage.content)
			: "";

		if (!queryText) {
			return this.fallbackCompression(messages, options.targetTokens);
		}

		const relevantDocs = await vectorStore.similaritySearch(
			queryText,
			Math.min(20, splitDocs.length),
		);

		const compressedContent = relevantDocs
			.map((doc) => doc.pageContent)
			.join("\n")
			.substring(0, options.targetTokens * 4);

		const compressedMessages: ChatMessage[] = [
			...systemMessages,
			{
				role: "system",
				content: `[Context compressed via RAG - Original context contained ${messages.length} messages]\n\nRelevant context:\n${compressedContent}`,
			},
			lastUserMessage,
		].filter(Boolean);

		return compressedMessages;
	}

	private fallbackCompression(
		messages: ChatMessage[],
		_targetTokens: number,
	): ChatMessage[] {
		const systemMessages = messages.filter((msg) => msg.role === "system");
		const lastUserMessage = messages.filter((msg) => msg.role === "user").pop();
		const lastAssistantMessage = messages
			.filter((msg) => msg.role === "assistant")
			.pop();

		const result = [...systemMessages];

		if (lastAssistantMessage) {
			result.push(lastAssistantMessage);
		}

		if (lastUserMessage) {
			result.push(lastUserMessage);
		}

		return result;
	}
}

export async function compressContextIfNeeded(
	messages: ChatMessage[],
	contextWindowSize: number,
	customization?: { compress_context?: boolean },
	embeddingsApiKey?: string,
): Promise<ChatMessage[]> {
	if (!customization?.compress_context) {
		return messages;
	}

	const totalContent = messages
		.map((msg) =>
			typeof msg.content === "string"
				? msg.content
				: msg.content
						.filter((item) => item.type === "text")
						.map((item) => item.text)
						.join(" "),
		)
		.join(" ");

	const estimatedTokens = Math.ceil(totalContent.length / 4);
	const contextThreshold = Math.floor(contextWindowSize * 0.9);

	if (estimatedTokens <= contextThreshold) {
		return messages;
	}

	const compressor = new ContextCompressor(embeddingsApiKey);
	const targetTokens = Math.floor(contextWindowSize * 0.7);

	return await compressor.compressMessages(messages, {
		targetTokens,
		embeddingsApiKey,
	});
}
