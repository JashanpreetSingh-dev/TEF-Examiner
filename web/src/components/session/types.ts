export type ConnState =
  | "idle"
  | "requesting_mic"
  | "prepping"
  | "fetching_token"
  | "connecting"
  | "connected"
  | "stopping"
  | "stopped"
  | "error";

export type Phase = "none" | "prebrief" | "prep" | "exam";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};


