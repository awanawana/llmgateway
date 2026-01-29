import { redisClient, SWRCache } from "@llmgateway/cache";
import {
	cdb as db,
	type ApiKey,
	type Project,
	type Organization,
	type InferSelectModel,
	type tables,
} from "@llmgateway/db";

type ProviderKey = InferSelectModel<typeof tables.providerKey>;
type ApiKeyIamRule = InferSelectModel<typeof tables.apiKeyIamRule>;
type User = InferSelectModel<typeof tables.user>;

const swrCache = new SWRCache(redisClient, "gateway:swr:");

const SWR_OPTIONS = {
	staleTime: 30,
	maxAge: 60,
	negativeMaxAge: 10,
};

export async function getApiKeyByToken(
	token: string,
): Promise<ApiKey | undefined> {
	return await swrCache.get(
		`apiKey:token:${token}`,
		async () => {
			return await db.query.apiKey.findFirst({
				where: {
					token: { eq: token },
				},
			});
		},
		SWR_OPTIONS,
	);
}

export async function getProjectById(
	projectId: string,
): Promise<Project | undefined> {
	return await swrCache.get(
		`project:${projectId}`,
		async () => {
			return await db.query.project.findFirst({
				where: {
					id: { eq: projectId },
				},
			});
		},
		SWR_OPTIONS,
	);
}

export async function getOrganizationById(
	organizationId: string,
): Promise<Organization | undefined> {
	return await swrCache.get(
		`org:${organizationId}`,
		async () => {
			return await db.query.organization.findFirst({
				where: {
					id: { eq: organizationId },
				},
			});
		},
		SWR_OPTIONS,
	);
}

export async function getProviderKeysByOrganization(
	organizationId: string,
): Promise<ProviderKey[]> {
	const result = await swrCache.get(
		`providerKeys:org:${organizationId}`,
		async () => {
			return await db.query.providerKey.findMany({
				where: {
					organizationId: { eq: organizationId },
					status: { eq: "active" },
				},
			});
		},
		SWR_OPTIONS,
	);
	return result ?? [];
}

export async function getProviderKeyByOrgAndProvider(
	organizationId: string,
	provider: string,
): Promise<ProviderKey | undefined> {
	const allKeys = await getProviderKeysByOrganization(organizationId);
	return allKeys.find((key) => key.provider === provider);
}

export async function getCustomProviderKey(
	organizationId: string,
	customProviderName: string,
): Promise<ProviderKey | undefined> {
	const allKeys = await getProviderKeysByOrganization(organizationId);
	return allKeys.find(
		(key) => key.provider === "custom" && key.name === customProviderName,
	);
}

export async function getProviderKeysByOrgAndProviders(
	organizationId: string,
	providerIds: string[],
): Promise<ProviderKey[]> {
	const allKeys = await getProviderKeysByOrganization(organizationId);
	return allKeys.filter((key) => providerIds.includes(key.provider));
}

export async function getApiKeyIamRules(
	apiKeyId: string,
): Promise<ApiKeyIamRule[]> {
	const result = await swrCache.get(
		`iamRules:${apiKeyId}`,
		async () => {
			return await db.query.apiKeyIamRule.findMany({
				where: {
					apiKeyId: { eq: apiKeyId },
					status: { eq: "active" },
				},
			});
		},
		SWR_OPTIONS,
	);
	return result ?? [];
}

export async function getUserFromOrganization(
	organizationId: string,
): Promise<User | null> {
	const result = await swrCache.get(
		`userOrg:${organizationId}`,
		async () => {
			const userOrg = await db.query.userOrganization.findFirst({
				where: {
					organizationId: { eq: organizationId },
				},
				with: {
					user: true,
				},
			});
			return userOrg?.user || null;
		},
		SWR_OPTIONS,
	);
	return result ?? null;
}
