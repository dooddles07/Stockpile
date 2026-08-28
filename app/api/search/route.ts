import { NextResponse } from "next/server";

import { getRole } from "@/lib/auth/session";
import { search } from "@/lib/repo/search";

/**
 * Global search runs on the server so the command palette never ships a
 * thousand-row index to every page load. Results are already permission
 * filtered for the active role.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const role = await getRole();
  return NextResponse.json({ hits: await search(q, role) });
}
