import type { ControllerCapture } from "@/session/controllerSession";

export type CaptureResponse = {
  ok: boolean;
  filename: string;
  path: string;
};

export async function sendCapture(kind: string, payload: ControllerCapture): Promise<CaptureResponse> {
  const response = await fetch("/api/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  if (!response.ok) {
    throw new Error(`Capture failed: HTTP ${response.status}`);
  }
  return (await response.json()) as CaptureResponse;
}
