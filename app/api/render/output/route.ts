import { readRenderOutput, type RenderEngine } from "@/lib/render-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
};

const parseRenderEngine = (value: string | null): RenderEngine => (value === "hyperframes" ? "hyperframes" : "remotion");

const getForwardedBlobHeaders = (request: Request) => {
  const headers = new Headers();
  const range = request.headers.get("range");
  const ifNoneMatch = request.headers.get("if-none-match");

  if (range) {
    headers.set("Range", range);
  }

  if (ifNoneMatch) {
    headers.set("If-None-Match", ifNoneMatch);
  }

  return headers;
};

const getContentDisposition = (filename: string) => {
  const safeFilename = filename.replace(/[^\w.-]/g, "_");
  return `inline; filename="${safeFilename}"`;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "Missing render id." }, { status: 400, headers: noStoreHeaders });
  }

  const output = await readRenderOutput(id, parseRenderEngine(searchParams.get("engine")), getForwardedBlobHeaders(request));

  if (!output) {
    return Response.json({ error: "Render output not found." }, { status: 404, headers: noStoreHeaders });
  }

  const headers = new Headers({
    "Cache-Control": "private, no-cache",
    "Content-Disposition": getContentDisposition(output.filename),
    "Content-Type": output.contentType,
  });

  const contentLength = output.headers.get("content-length");
  const contentRange = output.headers.get("content-range");
  const acceptRanges = output.headers.get("accept-ranges");

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }

  if (acceptRanges) {
    headers.set("Accept-Ranges", acceptRanges);
  }

  if (output.etag) {
    headers.set("ETag", output.etag);
  }

  return new Response(output.stream, {
    headers,
    status: output.status,
  });
}
