export type ExamSection = "EO1" | "EO2";

export type ExamState = 
  | "idle"
  | "selection"
  | "instructions"
  | "ad_display"
  | "exam_active"
  | "time_expired"
  | "grading"
  | "results"
  | "completed";

export interface Topic {
  id: number;
  section: ExamSection;
  prompt: string;
  title: string | null;
  suggested_questions?: string[];
  counter_arguments?: string[];
  time_limit_sec: number;
  image: string | null;
  difficulty: "easy" | "medium" | "hard";
}

export interface ExamSession {
  session_id: string;
  section: ExamSection;
  topic: Topic;
  state: ExamState;
}

export interface TranscriptEntry {
  speaker: "user" | "ai";
  text: string;
  timestamp?: number;
}

export interface DeterministicScores {
  speaking_time_sec: number;
  speaking_percentage: number;
  long_silences: number;
  interaction_turns: number;
  question_count?: number;
  repetition_score?: number;
  argument_count?: number;
}

export interface AIScores {
  relevance?: number;
  variety?: number;
  politeness?: number;
  reformulation?: number;
  interaction_quality?: number;
  structure?: number;
  argument_quality?: number;
  objection_handling?: number;
  fluency?: number;
  language_control?: number;
}

export interface ExamResults {
  session_id: string;
  deterministic_scores: DeterministicScores;
  ai_scores: AIScores;
  clb_level: number;
  readiness: "Not ready" | "Almost" | "Ready";
  improvement_points: string[];
  examiner_explanation: string;
}

