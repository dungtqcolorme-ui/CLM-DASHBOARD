import process from "node:process";

process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Supabase environment variables are missing from .env.local");
}

const { createClient } = await import("@supabase/supabase-js");
const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: sessionError } = await client.auth.getSession();
if (sessionError) throw sessionError;

const response = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
});

if (!response.ok) {
  throw new Error(`Supabase connection failed (${response.status})`);
}

console.log(`Supabase connection OK (${response.status})`);
