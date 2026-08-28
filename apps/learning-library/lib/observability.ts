type CurioEvent = {
  event: string;
  requestId?: string;
  jobId?: string;
  status?: string;
  errorCode?: string;
  attempt?: number;
  durationMs?: number;
};

export function requestId(request: Request): string {
  return request.headers.get("cf-ray")?.trim() || crypto.randomUUID();
}

export function logCurioEvent(event: CurioEvent, level: "info" | "warn" | "error" = "info"): void {
  const payload = JSON.stringify(event);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export function withRequestId(headers: HeadersInit | undefined, id: string): Headers {
  const result = new Headers(headers);
  result.set("X-Curio-Request-Id", id);
  return result;
}
