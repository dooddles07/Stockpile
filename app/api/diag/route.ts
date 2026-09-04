import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const result = await db.execute(sql`SELECT 1 AS ok`);
    return NextResponse.json({ status: "ok", result });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    return NextResponse.json(
      {
        status: "error",
        message: e.message,
        cause: e.cause instanceof Error ? e.cause.message : String(e.cause ?? ""),
        stack: e.stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 },
    );
  }
}
