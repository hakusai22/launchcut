import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { defaultVideoSpec, type VideoSpec } from "./video-spec";

export type RenderEngine = "remotion" | "hyperframes";
export type RenderStoreMode = "filesystem" | "blob";
export type RenderStatus = "queued" | "rendering" | "succeeded" | "failed";

export type RenderProgress = {
  percent: number;
  renderedFrames: number;
  encodedFrames: number;
  stage: "queued" | "bundling" | "rendering" | "encoding" | "muxing" | "done";
  message: string;
};

export type RenderTask = {
  id: string;
  engine: RenderEngine;
  status: RenderStatus;
  createdAt: string;
  updatedAt: string;
  attempts?: number;
  workerId?: string;
  startedAt?: string;
  heartbeatAt?: string;
  completedAt?: string;
  spec: VideoSpec;
  progress: RenderProgress;
  outputUrl?: string;
  outputPath?: string;
  compositionUrl?: string;
  compositionPath?: string;
  posterUrl?: string;
  posterPath?: string;
  error?: string;
};

export type RenderWorkerStatus = "idle" | "rendering" | "stopped";

export type RenderWorkerHeartbeat = {
  workerId: string;
  status: RenderWorkerStatus;
  updatedAt: string;
  currentTaskIds?: string[];
};

export type RenderWorkerHealth = {
  ok: boolean;
  required: boolean;
  staleAfterMs: number;
  ageMs: number | null;
  latest: RenderWorkerHeartbeat | null;
};

const isVercelLikeRuntime = () =>
  process.env.VERCEL === "1" ||
  Boolean(process.env.VERCEL_REGION) ||
  Boolean(process.env.NOW_REGION) ||
  process.cwd().startsWith("/var/task");

export const defaultRenderEngine: RenderEngine = "remotion";
const renderTaskReadRetries = 3;
const renderTaskReadRetryDelayMs = 40;
const hostedRenderTaskPrefix = "renders";
const renderWorkerHeartbeatPrefix = "render-workers";
const renderHealthKey = `${hostedRenderTaskPrefix}/_health/latest.json`;

export const isHostedRenderRuntime = isVercelLikeRuntime;

const getDefaultFilesystemRenderRoot = () =>
  isVercelLikeRuntime() ? path.join(os.tmpdir(), "renkumi", "renders") : path.join(process.cwd(), "public", "renders");

export const getFilesystemRenderRoot = () => {
  const configuredRoot = process.env.RENDER_ROOT?.trim();
  if (!configuredRoot) {
    return getDefaultFilesystemRenderRoot();
  }

  return path.isAbsolute(configuredRoot) ? configuredRoot : path.join(process.cwd(), configuredRoot);
};

export const getRenderRoot = getFilesystemRenderRoot;

export const getRenderTaskPath = (id: string) => path.join(getFilesystemRenderRoot(), id, "task.json");

export const getRenderBlobToken = () => process.env.BLOB_READ_WRITE_TOKEN?.trim();

export const getRenderStoreMode = (): RenderStoreMode =>
  process.env.RENDER_STORE?.trim().toLowerCase() === "blob" ? "blob" : "filesystem";

export const isBlobRenderStoreRequested = () => getRenderStoreMode() === "blob";

export const isBlobRenderStoreEnabled = () => isBlobRenderStoreRequested() && Boolean(getRenderBlobToken());

const shouldUseBlobRenderStore = isBlobRenderStoreEnabled;

export const getRenderStoreConfigError = () => {
  if (isBlobRenderStoreRequested() && !getRenderBlobToken()) {
    return {
      code: "RENDER_BLOB_STORE_NOT_CONFIGURED",
      error: "Vercel 渲染需要先配置 Vercel Blob。",
      detail:
        "请在 Vercel Storage 创建并绑定 Blob Store，确保部署环境存在 BLOB_READ_WRITE_TOKEN。渲染结果和任务状态都会写入 Blob。",
    };
  }

  return null;
};

export const getHostedRenderConfigError = () => {
  if (!isHostedRenderRuntime()) {
    return null;
  }

  if (!isBlobRenderStoreRequested()) {
    return {
      code: "RENDER_BLOB_STORE_NOT_ENABLED",
      error: "Vercel 渲染队列需要启用 Blob Render Store。",
      detail:
        "请在 Vercel 环境变量中设置 RENDER_STORE=blob，并确保独立 worker 使用同一个 BLOB_READ_WRITE_TOKEN。",
    };
  }

  return getRenderStoreConfigError();
};

const getHostedRenderTaskKey = (id: string) => `${hostedRenderTaskPrefix}/${id}/task.json`;

const getRenderWorkerHeartbeatKey = (workerId: string) => `${renderWorkerHeartbeatPrefix}/${workerId}.json`;

const getRenderOutputFileName = (engine: RenderEngine = defaultRenderEngine) =>
  engine === "hyperframes" ? "renkumi-hyperframes-video.mp4" : "renkumi-video.mp4";

const getHostedRenderOutputKey = (id: string, engine: RenderEngine = defaultRenderEngine) =>
  `${hostedRenderTaskPrefix}/${id}/${getRenderOutputFileName(engine)}`;

export const getRenderOutputPath = (id: string, engine: RenderEngine = defaultRenderEngine) =>
  path.join(getFilesystemRenderRoot(), id, getRenderOutputFileName(engine));

export const getRenderOutputUrl = (id: string, engine: RenderEngine = defaultRenderEngine) =>
  shouldUseBlobRenderStore() ? getHostedRenderOutputUrl(id, engine) : `/renders/${id}/${getRenderOutputFileName(engine)}`;

export const getHostedRenderOutputUrl = (id: string, engine: RenderEngine = defaultRenderEngine) => {
  const params = new URLSearchParams({ id });
  if (engine !== defaultRenderEngine) {
    params.set("engine", engine);
  }

  return `/api/render/output?${params.toString()}`;
};

export const getHyperframesCompositionPath = (id: string) =>
  path.join(getFilesystemRenderRoot(), id, "hyperframes", "index.html");

export const getHyperframesCompositionUrl = (id: string) => `/renders/${id}/hyperframes/index.html`;

export const getHyperframesPosterPath = (id: string) =>
  path.join(getFilesystemRenderRoot(), id, "hyperframes-poster.png");

export const getHyperframesPosterUrl = (id: string) => `/renders/${id}/hyperframes-poster.png`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeHostedRenderTask(task: RenderTask) {
  const token = getRenderBlobToken();
  if (!token) {
    return;
  }

  const { put } = await import("@vercel/blob");
  await put(getHostedRenderTaskKey(task.id), JSON.stringify(task, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
}

async function writeHostedJson(key: string, value: unknown) {
  const token = getRenderBlobToken();
  if (!token) {
    return;
  }

  const { put } = await import("@vercel/blob");
  await put(key, JSON.stringify(value, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
}

async function readHostedRenderTaskByKey(key: string): Promise<RenderTask | null> {
  return readHostedJsonByKey<RenderTask>(key);
}

async function readHostedJsonByKey<Value>(key: string): Promise<Value | null> {
  const token = getRenderBlobToken();
  if (!token) {
    return null;
  }

  const { BlobNotFoundError, get } = await import("@vercel/blob");

  try {
    const blob = await get(key, {
      access: "private",
      token,
      useCache: false,
    });

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return null;
    }

    return (await new Response(blob.stream).json()) as Value;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return null;
    }

    throw error;
  }
}

async function readHostedRenderTask(id: string): Promise<RenderTask | null> {
  return readHostedRenderTaskByKey(getHostedRenderTaskKey(id));
}

async function listHostedJsonKeys(prefix: string): Promise<string[]> {
  const token = getRenderBlobToken();
  if (!token) {
    return [];
  }

  const { list } = await import("@vercel/blob");
  const keys: string[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await list({
      cursor,
      limit: 1000,
      prefix,
      token,
    });
    keys.push(...page.blobs.map((blob: { pathname: string }) => blob.pathname));
    cursor = page.cursor;
    hasMore = page.hasMore;
  }

  return keys;
}

async function listHostedRenderTasks(): Promise<RenderTask[]> {
  const keys = await listHostedJsonKeys(`${hostedRenderTaskPrefix}/`);

  const tasks = await Promise.all(
    keys
      .filter((key) => key.endsWith("/task.json"))
      .map((key) =>
        readHostedRenderTaskByKey(key).catch(() => {
          return null;
        }),
      ),
  );

  return tasks
    .filter((task): task is RenderTask => Boolean(task))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createRenderTask(
  spec: VideoSpec = defaultVideoSpec,
  engine: RenderEngine = defaultRenderEngine,
): Promise<RenderTask> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const task: RenderTask = {
    id,
    engine,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    spec,
    progress: {
      percent: 0,
      renderedFrames: 0,
      encodedFrames: 0,
      stage: "queued",
      message: "等待开始",
    },
  };

  if (!shouldUseBlobRenderStore()) {
    await fs.mkdir(path.join(getFilesystemRenderRoot(), id), { recursive: true });
  }

  await writeRenderTask(task);

  return task;
}

export async function readRenderTask(id: string): Promise<RenderTask | null> {
  if (shouldUseBlobRenderStore()) {
    const hostedTask = await readHostedRenderTask(id);
    if (hostedTask) {
      return hostedTask;
    }
  }

  for (let attempt = 0; attempt <= renderTaskReadRetries; attempt += 1) {
    try {
      const raw = await fs.readFile(getRenderTaskPath(id), "utf8");
      return JSON.parse(raw) as RenderTask;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      if (error instanceof SyntaxError && attempt < renderTaskReadRetries) {
        await sleep(renderTaskReadRetryDelayMs);
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function listRenderTasks(): Promise<RenderTask[]> {
  if (shouldUseBlobRenderStore()) {
    return listHostedRenderTasks();
  }

  const entries = await fs.readdir(getFilesystemRenderRoot(), { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  });

  const tasks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readRenderTask(entry.name);
        } catch {
          return null;
        }
      }),
  );

  return tasks
    .filter((task): task is RenderTask => Boolean(task))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readLatestRenderTask(): Promise<RenderTask | null> {
  const [latestTask] = await listRenderTasks();
  return latestTask ?? null;
}

export async function writeRenderTask(task: RenderTask) {
  if (shouldUseBlobRenderStore()) {
    await writeHostedRenderTask({ ...task, updatedAt: new Date().toISOString() });
    return;
  }

  const taskPath = getRenderTaskPath(task.id);
  const taskDir = path.dirname(taskPath);
  const tempPath = path.join(taskDir, `task.${process.pid}.${Date.now()}.tmp`);
  const persistedTask = { ...task, updatedAt: new Date().toISOString() };

  await fs.mkdir(taskDir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(persistedTask, null, 2));
  await fs.rename(tempPath, taskPath);

}

export async function updateRenderTask(id: string, patch: Partial<RenderTask>) {
  const task = await readRenderTask(id);
  if (!task) {
    throw new Error(`Render task ${id} was not found`);
  }
  const nextTask = { ...task, ...patch, updatedAt: new Date().toISOString() };
  await writeRenderTask(nextTask);
  return nextTask;
}

export async function listQueuedRenderTasks(): Promise<RenderTask[]> {
  return (await listRenderTasks())
    .filter((task) => task.status === "queued")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function uploadRenderOutputToBlob(
  id: string,
  filePath: string,
  engine: RenderEngine = defaultRenderEngine,
) {
  const token = getRenderBlobToken();
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to upload render output.");
  }

  const { put } = await import("@vercel/blob");
  const bytes = await fs.readFile(filePath);
  await put(getHostedRenderOutputKey(id, engine), bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "video/mp4",
    token,
  });

  return getHostedRenderOutputUrl(id, engine);
}

export async function readRenderOutputBlob(
  id: string,
  engine: RenderEngine = defaultRenderEngine,
  headers?: HeadersInit,
) {
  const token = getRenderBlobToken();
  if (!token) {
    return null;
  }

  const { BlobNotFoundError, get } = await import("@vercel/blob");

  try {
    const blob = await get(getHostedRenderOutputKey(id, engine), {
      access: "private",
      headers,
      token,
      useCache: false,
    });

    if (!blob || !blob.stream) {
      return null;
    }

    return {
      contentType: blob.blob.contentType,
      etag: blob.blob.etag,
      filename: getRenderOutputFileName(engine),
      headers: blob.headers,
      stream: blob.stream,
    };
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return null;
    }

    throw error;
  }
}

export async function readRenderOutputFile(id: string, engine: RenderEngine = defaultRenderEngine, headers?: HeadersInit) {
  const filePath = getRenderOutputPath(id, engine);
  const stat = await fs.stat(filePath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (!stat?.isFile()) {
    return null;
  }

  const requestHeaders = new Headers(headers);
  const range = requestHeaders.get("range");
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const responseHeaders = new Headers({
    "accept-ranges": "bytes",
    "content-length": String(stat.size),
  });

  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    const [, rawStart, rawEnd] = match;
    const suffixLength = !rawStart && rawEnd ? Number(rawEnd) : null;
    const hasSuffixLength = Boolean(suffixLength && Number.isFinite(suffixLength));
    const requestedStart = hasSuffixLength ? Math.max(0, stat.size - suffixLength!) : rawStart ? Number(rawStart) : 0;
    const requestedEnd = hasSuffixLength ? stat.size - 1 : rawEnd ? Number(rawEnd) : stat.size - 1;

    if (
      Number.isFinite(requestedStart) &&
      Number.isFinite(requestedEnd) &&
      requestedStart >= 0 &&
      requestedEnd >= requestedStart &&
      requestedStart < stat.size
    ) {
      start = requestedStart;
      end = Math.min(requestedEnd, stat.size - 1);
      status = 206;
      responseHeaders.set("content-length", String(end - start + 1));
      responseHeaders.set("content-range", `bytes ${start}-${end}/${stat.size}`);
    }
  }

  return {
    contentType: "video/mp4",
    etag: undefined,
    filename: getRenderOutputFileName(engine),
    headers: responseHeaders,
    stream: Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>,
    status,
  };
}

export async function readRenderOutput(id: string, engine: RenderEngine = defaultRenderEngine, headers?: HeadersInit) {
  if (shouldUseBlobRenderStore()) {
    const output = await readRenderOutputBlob(id, engine, headers);
    return output ? { ...output, status: output.headers.get("content-range") ? 206 : 200 } : null;
  }

  return readRenderOutputFile(id, engine, headers);
}

export async function writeRenderWorkerHeartbeat(
  workerId: string,
  status: RenderWorkerStatus = "idle",
  currentTaskIds: string[] = [],
) {
  const heartbeat: RenderWorkerHeartbeat = {
    workerId,
    status,
    currentTaskIds,
    updatedAt: new Date().toISOString(),
  };

  if (shouldUseBlobRenderStore()) {
    await writeHostedJson(getRenderWorkerHeartbeatKey(workerId), heartbeat);
    return heartbeat;
  }

  const workerDir = path.join(getFilesystemRenderRoot(), "_workers");
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, `${workerId}.json`), JSON.stringify(heartbeat, null, 2));
  return heartbeat;
}

export async function listRenderWorkerHeartbeats(): Promise<RenderWorkerHeartbeat[]> {
  if (shouldUseBlobRenderStore()) {
    const keys = await listHostedJsonKeys(`${renderWorkerHeartbeatPrefix}/`);
    const heartbeats = await Promise.all(
      keys
        .filter((key) => key.endsWith(".json"))
        .map((key) =>
          readHostedJsonByKey<RenderWorkerHeartbeat>(key).catch(() => {
            return null;
          }),
        ),
    );

    return heartbeats
      .filter((heartbeat): heartbeat is RenderWorkerHeartbeat => Boolean(heartbeat))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  const workerDir = path.join(getFilesystemRenderRoot(), "_workers");
  const entries = await fs.readdir(workerDir).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  });

  const heartbeats = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        try {
          return JSON.parse(await fs.readFile(path.join(workerDir, entry), "utf8")) as RenderWorkerHeartbeat;
        } catch {
          return null;
        }
      }),
  );

  return heartbeats
    .filter((heartbeat): heartbeat is RenderWorkerHeartbeat => Boolean(heartbeat))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readLatestRenderWorkerHeartbeat(): Promise<RenderWorkerHeartbeat | null> {
  const [latestHeartbeat] = await listRenderWorkerHeartbeats();
  return latestHeartbeat ?? null;
}

export const getRenderWorkerHealthStaleMs = () => {
  const value = Number(process.env.RENDER_WORKER_HEALTH_STALE_MS);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 2 * 60 * 1000;
};

export async function getRenderWorkerHealth(): Promise<RenderWorkerHealth> {
  const latest = await readLatestRenderWorkerHeartbeat().catch(() => null);
  const ageMs = latest ? Date.now() - Date.parse(latest.updatedAt) : null;
  const executionMode = process.env.RENDER_EXECUTION_MODE?.trim().toLowerCase();
  const required = isHostedRenderRuntime() && isBlobRenderStoreEnabled() && executionMode !== "vercel-background";
  const staleAfterMs = getRenderWorkerHealthStaleMs();
  const ok = !required || (ageMs !== null && ageMs <= staleAfterMs);

  return {
    ok,
    required,
    staleAfterMs,
    ageMs,
    latest,
  };
}

export async function checkRenderStoreHealth() {
  const now = new Date().toISOString();

  if (shouldUseBlobRenderStore()) {
    const payload = { ok: true, checkedAt: now };
    await writeHostedJson(renderHealthKey, payload);
    const readBack = await readHostedJsonByKey<typeof payload>(renderHealthKey);
    return {
      mode: "blob" as const,
      ok: Boolean(readBack?.ok),
      checkedAt: now,
    };
  }

  const root = getFilesystemRenderRoot();
  const healthDir = path.join(root, "_health");
  const healthPath = path.join(healthDir, "latest.json");
  const payload = { ok: true, checkedAt: now };
  await fs.mkdir(healthDir, { recursive: true });
  await fs.writeFile(healthPath, JSON.stringify(payload, null, 2));
  const readBack = JSON.parse(await fs.readFile(healthPath, "utf8")) as typeof payload;

  return {
    mode: "filesystem" as const,
    ok: Boolean(readBack.ok),
    root,
    checkedAt: now,
  };
}
