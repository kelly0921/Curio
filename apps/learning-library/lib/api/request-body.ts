export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new SyntaxError("Request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}
