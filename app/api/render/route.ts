import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import {
  createRenderTask,
  defaultRenderEngine,
  isHostedRenderRuntime,
  updateRenderTask,
  type RenderEngine,
} from "@/lib/render-store";
import { defaultVideoSpec, type VideoSpec } from "@/lib/video-spec";

export const runtime = "nodejs";

type RenderBody = {
  engine?: RenderEngine;
  spec?: VideoSpec;
};

const parseRenderEngine = (value: unknown): RenderEngine =>
  value === "hyperframes" || value === "remotion" ? value : defaultRenderEngine;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RenderBody;
  const engine = parseRenderEngine(body.engine);

  if (isHostedRenderRuntime()) {
    return NextResponse.json(
      {
        code: "RENDER_UNAVAILABLE_ON_VERCEL",
        error: "当前 Vercel 部署环境暂不支持直接渲染视频，请在本地运行渲染任务。",
        detail:
          "视频渲染需要写入本地文件并启动后台 worker；Vercel Functions 只有 /tmp 可写且不适合这条本地渲染路径。",
        engine,
      },
      { status: 501 },
    );
  }

  const task = await createRenderTask(body.spec ?? defaultVideoSpec, engine);
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpm, ["exec", "tsx", "scripts/render-worker.ts", task.id], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });

  const failTask = (message: string) => {
    void updateRenderTask(task.id, {
      status: "failed",
      error: message,
      progress: {
        percent: 0,
        renderedFrames: 0,
        encodedFrames: 0,
        stage: "queued",
        message: "生成失败",
      },
    }).catch(() => undefined);
  };

  child.on("error", (error) => {
    failTask(error instanceof Error ? error.message : String(error));
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      failTask(`Render worker exited with code ${code}`);
    }
  });

  child.unref();

  return NextResponse.json({
    id: task.id,
    engine: task.engine,
    status: task.status,
    progress: task.progress,
    statusUrl: `/api/render/status?id=${task.id}`,
    pageUrl: `/renders/${task.id}`,
  });
}
