import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { db, sql, tables, inArray, gte, lte, and } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const activity = new OpenAPIHono<ServerTypes>();

// Define the response schema for model-specific usage
const modelUsageSchema = z.object({
	id: z.string(),
	provider: z.string(),
	requestCount: z.number(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
	cost: z.number(),
});

// Define the response schema for daily activity
const dailyActivitySchema = z.object({
	date: z.string(),
	requestCount: z.number(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	totalTokens: z.number(),
	cost: z.number(),
	inputCost: z.number(),
	outputCost: z.number(),
	requestCost: z.number(),
	errorCount: z.number(),
	errorRate: z.number(),
	cacheCount: z.number(),
	cacheRate: z.number(),
	modelBreakdown: z.array(modelUsageSchema),
});

// Define the route for getting activity data
const getActivity = createRoute({
	method: "get",
	path: "/",
	request: {
		query: z.object({
			days: z
				.string()
				.transform((val) => parseInt(val, 10))
				.pipe(z.number().int().positive()),
			projectId: z.string().optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						activity: z.array(dailyActivitySchema),
					}),
				},
			},
			description: "Activity data grouped by day",
		},
	},
});

activity.openapi(getActivity, async (c) => {
	const user = c.get("user");

	if (!user) {
		throw new HTTPException(401, {
			message: "Unauthorized",
		});
	}

	// Get the days parameter from the query
	const { days, projectId } = c.req.valid("query");

	// Calculate the date range
	const endDate = new Date();
	const startDate = new Date();
	startDate.setDate(startDate.getDate() - days);

	// Find all organizations the user belongs to
	const userOrganizations = await db.query.userOrganization.findMany({
		where: {
			userId: user.id,
		},
		with: {
			organization: true,
		},
	});

	if (!userOrganizations.length) {
		return c.json({
			activity: [],
		});
	}

	// Get all organizations the user is a member of
	const organizationIds = userOrganizations.map((uo) => uo.organizationId);

	// Get all projects associated with the user's organizations
	const projects = await db.query.project.findMany({
		where: {
			organizationId: {
				in: organizationIds,
			},
			status: {
				ne: "deleted",
			},
			...(projectId ? { id: projectId } : {}),
		},
	});

	if (!projects.length) {
		return c.json({
			activity: [],
		});
	}

	const projectIds = projects.map((project) => project.id);

	if (projectId && !projectIds.includes(projectId)) {
		throw new HTTPException(403, {
			message: "You don't have access to this project",
		});
	}

	// Build where conditions for the aggregation query
	const whereConditions = [
		inArray(tables.log.projectId, projectIds),
		gte(tables.log.createdAt, startDate),
		lte(tables.log.createdAt, endDate),
	];

	const whereClause = and(...whereConditions);

	// Query daily aggregated data using database-level aggregation
	const dailyAggregates = await db
		.select({
			date: sql<string>`DATE(${tables.log.createdAt})`.as("date"),
			requestCount: sql<number>`COUNT(*)`.as("requestCount"),
			inputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.promptTokens} AS NUMERIC)), 0)`.as(
					"inputTokens",
				),
			outputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.completionTokens} AS NUMERIC)), 0)`.as(
					"outputTokens",
				),
			totalTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.totalTokens} AS NUMERIC)), 0)`.as(
					"totalTokens",
				),
			cost: sql<number>`COALESCE(SUM(${tables.log.cost}), 0)`.as("cost"),
			inputCost: sql<number>`COALESCE(SUM(${tables.log.inputCost}), 0)`.as(
				"inputCost",
			),
			outputCost: sql<number>`COALESCE(SUM(${tables.log.outputCost}), 0)`.as(
				"outputCost",
			),
			requestCost: sql<number>`COALESCE(SUM(${tables.log.requestCost}), 0)`.as(
				"requestCost",
			),
			errorCount:
				sql<number>`COUNT(*) FILTER (WHERE ${tables.log.hasError} = true)`.as(
					"errorCount",
				),
			cacheCount:
				sql<number>`COUNT(*) FILTER (WHERE ${tables.log.cached} = true)`.as(
					"cacheCount",
				),
		})
		.from(tables.log)
		.where(whereClause)
		.groupBy(sql`DATE(${tables.log.createdAt})`)
		.orderBy(sql`DATE(${tables.log.createdAt}) ASC`);

	// Query model breakdown data using database-level aggregation
	const modelBreakdowns = await db
		.select({
			date: sql<string>`DATE(${tables.log.createdAt})`.as("date"),
			model: tables.log.usedModel,
			provider: tables.log.usedProvider,
			requestCount: sql<number>`COUNT(*)`.as("requestCount"),
			inputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.promptTokens} AS NUMERIC)), 0)`.as(
					"inputTokens",
				),
			outputTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.completionTokens} AS NUMERIC)), 0)`.as(
					"outputTokens",
				),
			totalTokens:
				sql<number>`COALESCE(SUM(CAST(${tables.log.totalTokens} AS NUMERIC)), 0)`.as(
					"totalTokens",
				),
			cost: sql<number>`COALESCE(SUM(${tables.log.cost}), 0)`.as("cost"),
		})
		.from(tables.log)
		.where(whereClause)
		.groupBy(
			sql`DATE(${tables.log.createdAt})`,
			tables.log.usedModel,
			tables.log.usedProvider,
		)
		.orderBy(
			sql`DATE(${tables.log.createdAt}) ASC`,
			tables.log.usedModel,
			tables.log.usedProvider,
		);

	// Organize model breakdowns by date
	const modelBreakdownMap = new Map<
		string,
		(typeof modelUsageSchema._type)[]
	>();
	for (const breakdown of modelBreakdowns) {
		const dateStr = breakdown.date;
		if (!modelBreakdownMap.has(dateStr)) {
			modelBreakdownMap.set(dateStr, []);
		}
		modelBreakdownMap.get(dateStr)!.push({
			id: breakdown.model || "unknown",
			provider: breakdown.provider || "unknown",
			requestCount: Number(breakdown.requestCount),
			inputTokens: Number(breakdown.inputTokens),
			outputTokens: Number(breakdown.outputTokens),
			totalTokens: Number(breakdown.totalTokens),
			cost: Number(breakdown.cost),
		});
	}

	// Build the final activity data combining daily aggregates with model breakdowns
	const activityData = dailyAggregates.map((day) => ({
		date: day.date,
		requestCount: Number(day.requestCount),
		inputTokens: Number(day.inputTokens),
		outputTokens: Number(day.outputTokens),
		totalTokens: Number(day.totalTokens),
		cost: Number(day.cost),
		inputCost: Number(day.inputCost),
		outputCost: Number(day.outputCost),
		requestCost: Number(day.requestCost),
		errorCount: Number(day.errorCount),
		errorRate:
			day.requestCount > 0
				? (Number(day.errorCount) / Number(day.requestCount)) * 100
				: 0,
		cacheCount: Number(day.cacheCount),
		cacheRate:
			day.requestCount > 0
				? (Number(day.cacheCount) / Number(day.requestCount)) * 100
				: 0,
		modelBreakdown: modelBreakdownMap.get(day.date) || [],
	}));

	return c.json({
		activity: activityData,
	});
});
