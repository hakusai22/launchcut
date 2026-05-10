import { NextResponse } from "next/server";
import { getRenderWorkerHealth, readRenderTask, type RenderTask } from "@/lib/render-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
};

const workerAction =
  "单 Vercel 部署请设置 RENDER_EXECUTION_MODE=vercel-background；多进程部署请在独立 Node 服务中启动 pnpm worker:render，并确认 RENDER_STORE=blob、BLOB_READ_WRITE_TOKEN 与 Vercel 环境一致。";

async function addQueueDiagnostics(task: RenderTask) {
  if (task.status !== "queued" && task.status !== "rendering") {
    return task;
  }

  const worker = await getRenderWorkerHealth();
  if (!worker.required) {
    return task;
  }

  if (worker.ok) {
    return {
      ...task,
      diagnostics: {
        worker,
        reason: task.status === "queued" ? "渲染 worker 在线，任务正在等待领取。" : "渲染 worker 在线。",
      },
    };
  }

  const reason = worker.latest
    ? "渲染执行器心跳已过期，当前任务不会继续推进。"
    : "没有检测到渲染执行器心跳，当前任务还没有被领取。";

  return {
    ...task,
    progress: {
      ...task.progress,
      message: task.status === "queued" ? "等待渲染执行器上线" : "渲染执行器心跳已过期",
    },
    diagnostics: {
      worker,
      reason,
      action: workerAction,
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing render id." }, { status: 400, headers: noStoreHeaders });
  }

  const task = await readRenderTask(id);

  if (!task) {
    return NextResponse.json({ error: "Render task not found." }, { status: 404, headers: noStoreHeaders });
  }

  return NextResponse.json(await addQueueDiagnostics(task), { headers: noStoreHeaders });
}
