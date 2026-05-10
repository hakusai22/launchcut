import { NextResponse } from "next/server";
import {
  checkRenderStoreHealth,
  getHostedRenderConfigError,
  getRenderStoreConfigError,
  getRenderStoreMode,
  getRenderWorkerHealth,
} from "@/lib/render-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
};

export async function GET() {
  const configError = getHostedRenderConfigError() ?? getRenderStoreConfigError();
  if (configError) {
    return NextResponse.json(
      {
        ok: false,
        store: {
          mode: getRenderStoreMode(),
          ok: false,
          error: configError,
        },
        worker: {
          ok: false,
          latest: null,
        },
      },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const store = await checkRenderStoreHealth().catch((error: unknown) => ({
    mode: getRenderStoreMode(),
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));

  const worker = await getRenderWorkerHealth();
  const ok = store.ok && worker.ok;

  return NextResponse.json(
    {
      ok,
      store,
      worker,
    },
    { status: ok ? 200 : 503, headers: noStoreHeaders },
  );
}
