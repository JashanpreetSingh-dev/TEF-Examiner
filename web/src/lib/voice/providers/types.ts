export interface VoiceProvider {
  // Connection management
  connect(stream: MediaStream, config: VoiceConfig): Promise<void>;
  disconnect(): Promise<void>;
  
  // Event handling
  onTranscript(callback: (text: string, role: "user" | "assistant") => void): void;
  onResponseStart(callback: () => void): void;
  onResponseEnd(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  
  // Control
  sendMessage(instructions: string, config?: ResponseConfig): void;
  updateSession(instructions: string, voice?: string): void;
  
  // Audio playback
  getRemoteAudioElement(): HTMLAudioElement | null;
  setRemoteAudioElement(element: HTMLAudioElement | null): void;
}

export interface VoiceConfig {
  model?: string;
  voice?: string;
  language?: string;
}

export interface ResponseConfig {
  maxOutputTokens?: number;
  modalities?: string[];
}

