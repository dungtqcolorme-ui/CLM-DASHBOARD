import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { databaseError } from "@/lib/marketing/server";

const schemaVersion = "20261110000100";
const missingSchema = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

type Environment = Record<string, string | undefined>;

function deploymentIdentity(env: Environment, databaseUrl?: string) {
  const revision = env.VERCEL_GIT_COMMIT_SHA || env.CLM_RELEASE_SHA;
  const environment = env.VERCEL_ENV || env.CLM_DEPLOYMENT_ENV;
  const databaseProjectRef = databaseUrl?.trim().match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1] ?? null;
  return {
    revision: revision && /^[0-9a-f]{40}$/.test(revision) ? revision : null,
    environment: environment && ["preview", "production", "development", "staging"].includes(environment)
      ? environment : null,
    databaseProjectRef,
  };
}

export async function readMarketingReadiness(client: SupabaseClient, env: Environment = process.env, databaseUrl?: string) {
  const { data, error } = await client.rpc("marketing_readiness_probe");
  if (error && !missingSchema.has(error.code)) databaseError(error);

  const missing = (names: string[]) => names.filter((name) => !env[name]?.trim());
  return {
    schema: error ? "missing" : data === schemaVersion ? "current" : "unexpected",
    expectedMigration: schemaVersion,
    liveMetaRequested: env.LIVE_META_PUBLISH_ENABLED === "true",
    deployment: deploymentIdentity(env, databaseUrl),
    integrations: {
      meta: {
        status: "adapter_unavailable",
        missingSettings: missing(["META_APP_ID", "META_APP_SECRET", "META_GRAPH_VERSION", "MARKETING_CREDENTIALS_KEY"]),
      },
      publisher: {
        status: "worker_unavailable",
        missingSettings: missing(["MARKETING_WORKER_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]),
      },
      drive: { status: "oauth_unavailable", missingSettings: [] },
      agent: { status: "provider_unavailable", missingSettings: [] },
      render: { status: "worker_unavailable", missingSettings: [] },
    },
  } as const;
}
