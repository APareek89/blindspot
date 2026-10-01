export const GOLDEN_FILE_BYTES = 400 * 1024;
export const ACTION_PAYLOAD_BYTES = 512 * 1024;
export async function boundedAction<T>(payload: unknown, action: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > ACTION_PAYLOAD_BYTES) {
    return { ok: false, error: "This request exceeds the 512 KiB limit. Reduce the dataset or shared context before retrying." };
  }
  return action();
}
export function validDraftCount(value: number) { return Number.isInteger(value) && value >= 1 && value <= 20; }
