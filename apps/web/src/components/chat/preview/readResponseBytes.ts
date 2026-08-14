export async function readResponseBytes(
  response: Response,
  fallbackTotal: number,
  onProgress: (progress: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = Number(response.headers.get("content-length"));
  const total = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : fallbackTotal;

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(1);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (total > 0) onProgress(Math.min(1, loaded / total));
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(1);
  return bytes;
}
