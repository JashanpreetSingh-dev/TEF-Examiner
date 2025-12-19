import type { TranscriptLine } from "@/components/session/types";

export type StopReason = "user_stop" | "timeout";

export type EvaluationStatus = "idle" | "loading" | "done" | "error";

export type EvalMetrics = {
  eo1_question_count?: number;
  eo1_question_target?: string;
  eo1_question_count_method?: "punctuation" | "heuristic";
};

export type EvalCriterion = {
  name: string;
  score_0_10: number;
  comment: string;
  improvements: string[];
};

export type EvalSentenceUpgrade = {
  weak: string;
  better: string;
  why: string;
};

export type EvalResult = {
  overall_band_estimate: string;
  overall_comment: string;
  criteria: EvalCriterion[];
  strengths: string[];
  top_improvements: string[];
  upgraded_sentences: EvalSentenceUpgrade[];
  cecr_level: string;
  clb_equivalence: string;
  approximate_tef_band: string;
};

export type ExamResultDocument = {
  _id?: string;
  userId: string;
  sessionId: string;
  createdAt: Date;
  endedAt: Date;
  sectionKey: "A" | "B";
  scenarioId: number;
  scenarioPrompt: string;
  timeLimitSec: number;
  endedReason: StopReason;
  finalTranscript: TranscriptLine[];
  finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
  evaluation?: {
    model: string;
    metrics: EvalMetrics;
    result: EvalResult | { raw: string };
  } | null;
  evaluationStatus: EvaluationStatus;
  evaluationError?: string | null;
};


