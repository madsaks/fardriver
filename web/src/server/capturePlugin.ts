import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const CAPTURE_DIR = path.resolve(process.cwd(), "../reference/captures");
const MAX_BODY_BYTES = 10 * 1024 * 1024;

export function capturePlugin(): Plugin {
  return {
    name: "fardriver-capture-api",
    configureServer(server) {
      server.middlewares.use("/api/captures", captureMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/captures", captureMiddleware);
    },
  };
}

async function captureMiddleware(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === "POST") {
      await handlePost(req, res);
      return;
    }
    if (req.method === "GET") {
      await handleGet(res);
      return;
    }
    sendJson(res, 405, { error: "method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "capture failed";
    sendJson(res, 500, { error: message });
  }
}

async function handlePost(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  const payload = JSON.parse(body) as { kind?: string; payload?: unknown };
  const kind = sanitizeKind(payload.kind ?? "capture");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(CAPTURE_DIR, { recursive: true });
  const filename = `${stamp}-${kind}.json`;
  const filePath = path.join(CAPTURE_DIR, filename);
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        kind,
        payload: payload.payload ?? payload,
      },
      null,
      2,
    ),
    "utf8",
  );
  sendJson(res, 201, { ok: true, filename, path: filePath });
}

async function handleGet(res: ServerResponse) {
  await fs.mkdir(CAPTURE_DIR, { recursive: true });
  const files = (await fs.readdir(CAPTURE_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();
  sendJson(res, 200, { files });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("capture body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sanitizeKind(kind: string): string {
  return kind.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "capture";
}
