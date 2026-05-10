import { spawn } from "node:child_process";
import { after, NextResponse } from "next/server";
import {
  createRenderTask,
  defaultRenderEngine,
  getHostedRenderConfigError,
  getRenderStoreConfigError,
  isBlobRenderStoreEnabled,
  isHostedRenderRuntime,
  readRenderTask,
  updateRenderTask,
  uploadRenderOutputToBlob,
  writeRenderWorkerHeartbeat,
  type RenderEngine,
  type RenderTask,
} from "@/lib/render-store";
import { defaultVideoSpec, type VideoSpec } from "@/lib/video-spec";

export const runtime = "nodejs";
export const maxDuration = 300;

type RenderBody = {
  engine?: RenderEngine;
  spec?: VideoSpec;
};

const parseRenderEngine = (value: unknown): RenderEngine =>
  value === "hyperframes" || value === "remotion" ? value : defaultRenderEngine;

const getRenderExecutionMode = () => process.env.RENDER_EXECUTION_MODE?.trim().toLowerCase();

const isVercelBackgroundRenderEnabled = () => getRenderExecutionMode() === "vercel-background";

const getHostedBackgroundWorkerId = () => process.env.RENDER_WORKER_ID?.trim() || "vercel-background";

const toRenderResponse = (task: RenderTask) => ({
  id: task.id,
  engine: task.engine,
  status: task.status,
  progress: task.progress,
  executionMode: isHostedRenderRuntime()
    ? isVercelBackgroundRenderEnabled()
      ? "vercel-background"
      : "queue"
    : isBlobRenderStoreEnabled()
      ? "blob-queue"
      : "local-worker",
  statusUrl: `/api/render/status?id=${task.id}`,
  pageUrl: `/renders/${task.id}`,
});

const failRenderTask = async (id: string, message: string, workerId?: string) => {
  await updateRenderTask(id, {
    status: "failed",
    workerId,
    completedAt: new Date().toISOString(),
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

const spawnRenderTask = (task: RenderTask) => {
  const child = spawn(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--env-file-if-exists=.env.local",
      "--import",
      "tsx",
      "scripts/render-worker.ts",
      task.id,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    },
  );

  child.on("error", (error) => {
    void failRenderTask(task.id, error instanceof Error ? error.message : String(error));
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      void failRenderTask(task.id, `Render worker exited with code ${code}`);
    }
  });

  child.unref();
};

const runHostedBackgroundRender = async (id: string) => {
  const workerId = getHostedBackgroundWorkerId();
  const task = await readRenderTask(id);
  if (!task) {
    throw new Error(`Render task ${id} was not found`);
  }

  const startedAt = new Date().toISOString();
  const heartbeatTimer = setInterval(() => {
    void writeRenderWorkerHeartbeat(workerId, "rendering", [id]).catch(() => undefined);
    void updateRenderTask(id, { heartbeatAt: new Date().toISOString(), workerId }).catch(() => undefined);
  }, 10_000);

  try {
    await writeRenderWorkerHeartbeat(workerId, "rendering", [id]);
    await updateRenderTask(id, {
      status: "rendering",
      attempts: (task.attempts ?? 0) + 1,
      workerId,
      startedAt,
      heartbeatAt: startedAt,
      completedAt: undefined,
      error: undefined,
      progress: {
        percent: 1,
        renderedFrames: 0,
        encodedFrames: 0,
        stage: "queued",
        message: "Vercel 后台渲染已启动",
      },
    });

    const { renderRenkumiVideo } = await import("@/lib/render-renkumi-video");
    const result = await renderRenkumiVideo(id);

    if (!result.outputPath) {
      throw new Error("Render finished without a local output path to upload.");
    }

    await updateRenderTask(id, {
      heartbeatAt: new Date().toISOString(),
      workerId,
      progress: {
        ...result.progress,
        percent: 96,
        stage: "muxing",
        message: "正在上传视频到 Vercel Blob",
      },
    });

    const outputUrl = await uploadRenderOutputToBlob(id, result.outputPath, "remotion");
    await updateRenderTask(id, {
      status: "succeeded",
      workerId,
      heartbeatAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outputUrl,
    });
  } catch (error) {
    await failRenderTask(id, error instanceof Error ? error.message : String(error), workerId);
  } finally {
    clearInterval(heartbeatTimer);
    await writeRenderWorkerHeartbeat(workerId, "idle", []).catch(() => undefined);
  }
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RenderBody;
  const engine = parseRenderEngine(body.engine);

  if (isHostedRenderRuntime()) {
    if (engine !== "remotion") {
      return NextResponse.json(
        {
          code: "RENDER_ENGINE_UNAVAILABLE_IN_HOSTED_QUEUE",
          error: "当前部署环境仅支持 Remotion 队列渲染。",
          detail: "HyperFrames 仍需要本地浏览器、Python 和 ffmpeg，请在本地运行。",
          engine,
        },
        { status: 501 },
      );
    }

    const configError = getHostedRenderConfigError();
    if (configError) {
      return NextResponse.json({ ...configError, engine }, { status: 503 });
    }

    try {
      const task = await createRenderTask(body.spec ?? defaultVideoSpec, engine);
      if (isVercelBackgroundRenderEnabled()) {
        const queuedTask = await updateRenderTask(task.id, {
          progress: {
            ...task.progress,
            percent: 1,
            message: "已安排 Vercel 后台渲染",
          },
        });
        after(async () => {
          await runHostedBackgroundRender(task.id);
        });
        return NextResponse.json(toRenderResponse(queuedTask));
      }

      return NextResponse.json(toRenderResponse(task));
    } catch (error) {
      return NextResponse.json(
        {
          code: "RENDER_TASK_QUEUE_FAILED",
          error: "渲染任务创建失败。",
          detail: error instanceof Error ? error.message : String(error),
          engine,
        },
        { status: 503 },
      );
    }
  }

  const storeConfigError = getRenderStoreConfigError();
  if (storeConfigError) {
    return NextResponse.json({ ...storeConfigError, engine }, { status: 503 });
  }

  if (isBlobRenderStoreEnabled()) {
    if (engine !== "remotion") {
      return NextResponse.json(
        {
          code: "RENDER_ENGINE_UNAVAILABLE_IN_HOSTED_QUEUE",
          error: "Blob 队列模式仅支持 Remotion 渲染。",
          detail: "HyperFrames 请使用本地文件系统模式运行。",
          engine,
        },
        { status: 501 },
      );
    }

    const task = await createRenderTask(body.spec ?? defaultVideoSpec, engine);
    spawnRenderTask(task);
    return NextResponse.json(toRenderResponse(task));
  }

  const task = await createRenderTask(body.spec ?? defaultVideoSpec, engine);
  spawnRenderTask(task);
  return NextResponse.json(toRenderResponse(task));
}
