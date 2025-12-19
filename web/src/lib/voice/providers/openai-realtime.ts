import type { VoiceProvider, VoiceConfig, ResponseConfig } from "./types";
import { isIgnorableRealtimeError } from "@/app/session/[section]/realtime-exam-runner.utils";
import { isRecord } from "@/app/session/[section]/realtime-exam-runner.utils";

export class OpenAIRealtimeProvider implements VoiceProvider {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private localStream: MediaStream | null = null;
  
  private transcriptCallback: ((text: string, role: "user" | "assistant") => void) | null = null;
  private responseStartCallback: (() => void) | null = null;
  private responseEndCallback: (() => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  
  private awaitingResponse = false;
  private token: string | null = null;
  private model: string | null = null;
  private voice: string | null = null;

  async connect(stream: MediaStream, config: VoiceConfig): Promise<void> {
    this.localStream = stream;

    // Fetch token
    const tokenRes = await fetch("/api/realtime-token", { method: "GET" });
    if (!tokenRes.ok) {
      throw new Error(`Token request failed (${tokenRes.status}).`);
    }
    const tokenJson = (await tokenRes.json()) as { token: string; model: string; voice: string };
    this.token = tokenJson.token;
    this.model = config.model ?? tokenJson.model;
    this.voice = config.voice ?? tokenJson.voice;

    // Create WebRTC connection
    this.pc = new RTCPeerConnection();

    // Remote audio playback
    this.pc.ontrack = (e) => {
      if (this.remoteAudioElement) {
        const [trackStream] = e.streams;
        this.remoteAudioElement.srcObject = trackStream;
      }
    };

    // Send mic audio
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }

    // Create data channel
    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (msg) => {
      try {
        const evt = JSON.parse(String(msg.data)) as { type?: string; [k: string]: unknown };
        this.handleEvent(evt);
      } catch {
        // ignore
      }
    };

    // Negotiate SDP with OpenAI Realtime
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
    await this.pc.setLocalDescription(offer);

    if (!this.pc.localDescription?.sdp) {
      throw new Error("Missing local SDP.");
    }

    const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
      },
      body: this.pc.localDescription.sdp,
    });

    if (!sdpRes.ok) {
      const text = await sdpRes.text().catch(() => "");
      throw new Error(`SDP exchange failed (${sdpRes.status}): ${text}`);
    }

    const answerSdp = await sdpRes.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    // Wait for data channel to open
    await new Promise<void>((resolve) => {
      if (this.dc?.readyState === "open") {
        return resolve();
      }
      this.dc!.onopen = () => resolve();
    });
  }

  disconnect(): Promise<void> {
    try {
      this.dc?.close();
    } catch {}
    this.dc = null;

    try {
      this.pc?.close();
    } catch {}
    this.pc = null;

    for (const t of this.localStream?.getTracks() ?? []) {
      try {
        t.stop();
      } catch {}
    }
    this.localStream = null;

    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.pause();
      } catch {}
      const stream = this.remoteAudioElement.srcObject as MediaStream | null;
      this.remoteAudioElement.srcObject = null;
      for (const t of stream?.getTracks?.() ?? []) {
        try {
          t.stop();
        } catch {}
      }
    }
    
    return Promise.resolve();
  }

  onTranscript(callback: (text: string, role: "user" | "assistant") => void): void {
    this.transcriptCallback = callback;
  }

  onResponseStart(callback: () => void): void {
    this.responseStartCallback = callback;
  }

  onResponseEnd(callback: () => void): void {
    this.responseEndCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  sendMessage(instructions: string, config?: ResponseConfig): void {
    if (!this.dc || this.dc.readyState !== "open") return;
    if (this.awaitingResponse) return;

    // Don't set awaitingResponse here - wait for response.audio_transcript.delta
    // to know when the response actually starts

    const event = {
      type: "response.create" as const,
      response: {
        modalities: config?.modalities ?? (["audio", "text"] as const),
        instructions,
        max_output_tokens: config?.maxOutputTokens,
      },
    };

    this.sendEvent(event);
  }

  updateSession(instructions: string, voice?: string): void {
    if (!this.dc || this.dc.readyState !== "open") return;

    const event = {
      type: "session.update" as const,
      session: {
        instructions,
        voice: voice ?? this.voice ?? "alloy",
        modalities: ["audio", "text"] as const,
      },
    };

    this.sendEvent(event);
  }

  getRemoteAudioElement(): HTMLAudioElement | null {
    return this.remoteAudioElement;
  }

  setRemoteAudioElement(element: HTMLAudioElement | null): void {
    this.remoteAudioElement = element;
  }

  private sendEvent(evt: Record<string, unknown>): void {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify(evt));
  }

  private handleEvent(evt: { type?: string; [k: string]: unknown }): void {
    const type = evt.type ?? "";

    // Handle response completion
    if (type === "response.completed" || type === "response.done" || type === "response.finished") {
      this.awaitingResponse = false;
      if (this.responseEndCallback) {
        this.responseEndCallback();
      }
    }

    // Handle response start (when assistant starts speaking)
    if (type === "response.audio_transcript.delta") {
      if (!this.awaitingResponse) {
        // First audio transcript delta means response started
        this.awaitingResponse = true;
        if (this.responseStartCallback) {
          this.responseStartCallback();
        }
      }
      
      // Extract transcript text
      if (isRecord(evt) && "delta" in evt && typeof evt.delta === "string") {
        if (this.transcriptCallback) {
          this.transcriptCallback(evt.delta, "assistant");
        }
      }
    }
    
    // Handle response audio transcript done
    if (type === "response.audio_transcript.done") {
      // Extract final transcript if available
      if (isRecord(evt) && "text" in evt && typeof evt.text === "string") {
        if (this.transcriptCallback) {
          this.transcriptCallback(evt.text, "assistant");
        }
      }
    }

    // Handle conversation item updates (user/assistant transcripts)
    if (type === "conversation.item.input_audio_transcript.completed") {
      if (isRecord(evt) && "item" in evt) {
        const item = evt.item;
        if (isRecord(item) && "id" in item && item.id === "user") {
          const transcript = isRecord(item) && "input_audio_transcript" in item && isRecord(item.input_audio_transcript)
            ? String(item.input_audio_transcript.text ?? "")
            : "";
          if (transcript && this.transcriptCallback) {
            this.transcriptCallback(transcript, "user");
          }
        }
      }
    }

    // Handle errors
    if (type === "error") {
      if (isIgnorableRealtimeError(evt)) return;
      const errorMsg = isRecord(evt) && "error" in evt && isRecord(evt.error) && "message" in evt.error
        ? String(evt.error.message)
        : JSON.stringify(evt);
      if (this.errorCallback) {
        this.errorCallback(new Error(errorMsg));
      }
    }
  }
}

