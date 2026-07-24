import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { googleCalendarStatus } from "@/lib/googleCalendar";

export async function GET(request: Request) {
  try {
    await getRequestIdentity(request);
    return NextResponse.json(await googleCalendarStatus());
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không kiểm tra được Google Calendar." },
      { status },
    );
  }
}
