import type { VoiceProvider } from "./types";
import { OpenAIRealtimeProvider } from "./openai-realtime";
import { DeepgramProvider } from "./deepgram";

export function createVoiceProvider(): VoiceProvider {
  const provider = process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? "openai";
  
  switch (provider) {
    case "deepgram":
      return new DeepgramProvider();
    case "openai":
    default:
      return new OpenAIRealtimeProvider();
  }
}

