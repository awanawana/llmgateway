import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const canvasCatalog = defineCatalog(schema, {
	components: {
		// Layout
		Card: {
			props: z.object({
				title: z.string().nullable().optional(),
				description: z.string().nullable().optional(),
			}),
			description: "A card container with optional title and description",
		},
		Row: {
			props: z.object({
				gap: z.number().nullable().optional(),
				align: z
					.enum(["start", "center", "end", "stretch"])
					.nullable()
					.optional(),
			}),
			description: "Horizontal layout container",
		},
		Column: {
			props: z.object({
				gap: z.number().nullable().optional(),
			}),
			description: "Vertical layout container",
		},
		Grid: {
			props: z.object({
				columns: z.number().min(1).max(6).nullable().optional(),
				gap: z.number().nullable().optional(),
			}),
			description: "Grid layout with configurable columns",
		},
		Divider: {
			props: z.object({}),
			description: "A horizontal divider line",
		},

		// Content
		Text: {
			props: z.object({
				content: z.string(),
				variant: z
					.enum(["default", "muted", "success", "warning", "error"])
					.nullable()
					.optional(),
			}),
			description: "Text content with optional styling variant",
		},
		Heading: {
			props: z.object({
				content: z.string(),
				level: z.number().min(1).max(4).nullable().optional(),
			}),
			description: "Heading text, level 1-4",
		},
		Badge: {
			props: z.object({
				label: z.string(),
				variant: z
					.enum(["default", "secondary", "outline", "destructive"])
					.nullable()
					.optional(),
			}),
			description: "A small status badge",
		},
		Image: {
			props: z.object({
				src: z.string(),
				alt: z.string().nullable().optional(),
				width: z.number().nullable().optional(),
				height: z.number().nullable().optional(),
			}),
			description: "An image element",
		},
		Code: {
			props: z.object({
				content: z.string(),
				language: z.string().nullable().optional(),
			}),
			description: "A code block",
		},

		// Data
		Metric: {
			props: z.object({
				label: z.string(),
				value: z.string(),
				change: z.string().nullable().optional(),
				trend: z.enum(["up", "down", "flat"]).nullable().optional(),
			}),
			description:
				"Display a metric with label, value, and optional trend indicator",
		},
		Table: {
			props: z.object({
				headers: z.array(z.string()),
				rows: z.array(z.array(z.string())),
			}),
			description: "A data table with headers and rows",
		},
		ProgressBar: {
			props: z.object({
				value: z.number().min(0).max(100),
				label: z.string().nullable().optional(),
			}),
			description: "A progress bar showing a percentage",
		},

		// Interactive
		Button: {
			props: z.object({
				label: z.string(),
				variant: z
					.enum(["default", "secondary", "outline", "destructive", "ghost"])
					.nullable()
					.optional(),
				disabled: z.boolean().nullable().optional(),
			}),
			description: "A clickable button",
		},
		TextInput: {
			props: z.object({
				placeholder: z.string().nullable().optional(),
				label: z.string().nullable().optional(),
			}),
			description: "A text input field",
		},
		Switch: {
			props: z.object({
				label: z.string().nullable().optional(),
				defaultChecked: z.boolean().nullable().optional(),
			}),
			description: "A toggle switch",
		},
		Select: {
			props: z.object({
				label: z.string().nullable().optional(),
				placeholder: z.string().nullable().optional(),
				options: z.array(
					z.object({
						label: z.string(),
						value: z.string(),
					}),
				),
			}),
			description: "A dropdown select",
		},
	},
	actions: {},
});
