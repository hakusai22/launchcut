import { NextResponse } from "next/server";
import { readLatestRenderTask } from "@/lib/render-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
};

export async function GET() {
  const task = await readLatestRenderTask();

  if (!task) {
    return new NextResponse(null, { status: 204, headers: noStoreHeaders });
  }

  return NextResponse.json(task, { headers: noStoreHeaders });
}
