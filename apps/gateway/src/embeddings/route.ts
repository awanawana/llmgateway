import { OpenAPIHono } from "@hono/zod-openapi";

import { embeddings as embeddingsApi } from "./embeddings.js";

import type { ServerTypes } from "@/vars.js";

export const embeddings = new OpenAPIHono<ServerTypes>();
embeddings.route("/", embeddingsApi);
