import type { TranscriptLine } from "@/components/session/types";

export type RunnerMode = "live" | "results";
export type StopReason = "user_stop" | "timeout";
export type EvaluationStatus = "idle" | "loading" | "done" | "error";

export type RealtimeDebugStats = {
  dcEvents: number;
  responsesCreated: number;
  responsesDone: number;
  lastUsage?: unknown;
};

export type SessionSummary = {
  endedAtMs: number;
  endedReason: StopReason;
  finalTranscript: TranscriptLine[];
  finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
  evaluation: unknown | null;
  evaluationStatus: EvaluationStatus;
  evaluationError: string | null;
};

