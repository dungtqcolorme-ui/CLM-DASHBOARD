import { NextResponse } from "next/server";
import { pingSupabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    const result = await pingSupabase();
    return NextResponse.json({ service: "supabase", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { service: "supabase", ok: false, error: message },
      { status: 503 },
    );
  }
}
