import type { TranscriptLine } from "@/components/session/types";

export function randomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object";
}

export function isIgnorableRealtimeError(evt: unknown): boolean {
  if (!isRecord(evt)) return false;
  const err = isRecord(evt.error) ? evt.error : null;
  const code = err && typeof err.code === "string" ? err.code : undefined;
  if (code === "conversation_already_has_active_response") return true;

  const msg = String(err && "message" in err ? (err as Record<string, unknown>).message ?? "" : "");
  if (msg.includes("Conversation already has an active response in progress")) return true;

  return false;
}

export function toExaminerLines(snapshot: TranscriptLine[]) {
  return snapshot.filter((t): t is TranscriptLine & { role: "assistant" } => t.role === "assistant");
}

