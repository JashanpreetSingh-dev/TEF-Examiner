import type { VoiceProvider, VoiceConfig, ResponseConfig } from "./types";

interface DeepgramConfig {
  token: string; // JWT token for WebSocket authentication
  model?: string;
  voice?: string;
  language?: string;
  audioMode?: "hifi" | "telephony";
  thinkModel?: string;
}

interface DeepgramMessage {
  type: string;
  [key: string]: unknown;
}

interface InjectUserMessage {
  type: "InjectUserMessage";
  content: string;
}

interface SettingsMessage {
  type: "Settings";
  audio: {
    input: {
      encoding: "linear16" | "linear32" | "flac" | "alaw" | "mulaw" | "opus" | "ogg-opus" | "speex" | "g729" | "amr-nb" | "amr-wb";
      sample_rate: number;
    };
    output?: {
      encoding?: "linear16" | "mulaw" | "alaw";
      sample_rate?: number;
      bitrate?: number;
      container?: string;
    };
  };
  agent: {
    language?: string;
    listen: {
      provider: {
        type: "deepgram";
        model: string;
        keyterms?: string[];
        smart_format?: boolean;
      };
    };
    think: {
      provider: {
        type: "open_ai";
        model: "gpt-5" | "gpt-5-mini" | "gpt-5-nano" | "gpt-4.1" | "gpt-4.1-mini" | "gpt-4.1-nano" | "gpt-4o" | "gpt-4o-mini";
        temperature?: number;
      };
      prompt: string;
    };
    speak: {
      provider: {
        type: "deepgram" | "eleven_labs" | "cartesia" | "open_ai" | "aws_polly";
        model?: string; // For deepgram
        model_id?: string; // For eleven_labs, cartesia
        voice?: string; // For open_ai, aws_polly
        language_code?: string; // For eleven_labs, aws_polly
        language?: string; // For cartesia
        engine?: string; // For aws_polly
        credentials?: unknown; // For aws_polly
      };
      endpoint?: {
        url: string;
        headers: Record<string, string>;
      };
    };
    greeting?: string;
    context?: {
      messages?: Array<{
        type: "History";
        role: "user" | "assistant";
        content: string;
      }>;
    };
  };
}

interface UpdateSpeakMessage {
  type: "UpdateSpeak";
  speak: {
    provider: {
      type: "deepgram" | "eleven_labs" | "cartesia" | "open_ai" | "aws_polly";
      model?: string; // For deepgram
      model_id?: string; // For eleven_labs, cartesia
      voice?: string; // For open_ai, aws_polly
      language_code?: string; // For eleven_labs, aws_polly
      language?: string; // For cartesia
      engine?: string; // For aws_polly
      credentials?: unknown; // For aws_polly
    };
    endpoint?: {
      url: string;
      headers: Record<string, string>;
    };
  };
}

export class DeepgramProvider implements VoiceProvider {
  private ws: WebSocket | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private pendingBytes: Uint8Array = new Uint8Array(0); // buffered audio bytes for fixed-size sending
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private playbackAudioContext: AudioContext | null = null;
  private nextPlaybackTime = 0; // Scheduled playback cursor to avoid gaps/choppiness
  
  private transcriptCallback: ((text: string, role: "user" | "assistant") => void) | null = null;
  private responseStartCallback: (() => void) | null = null;
  private responseEndCallback: (() => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  
  private awaitingResponse = false;
  private config: DeepgramConfig | null = null;
  private keepAliveInterval: number | null = null;
  // Default: natural audio. Can be switched to telephony via DEEPGRAM_AUDIO_MODE=telephony.
  private audioMode: "hifi" | "telephony" = "hifi";
  private sampleRate = 24000; // Must match Settings.audio.input.sample_rate
  private outputSampleRate = 24000; // Must match Settings.audio.output.sample_rate
  private outputEncoding: "linear16" | "mulaw" | "alaw" = "linear16";
  private initialInstructions: string | null = null; // Store instructions for Settings message

  async connect(stream: MediaStream, config: VoiceConfig): Promise<void> {
    this.localStream = stream;
    // Instructions should be set via updateSession() before connect() is called
    // If not set, they'll be undefined in Settings (can be updated later)

    // Fetch Deepgram config
    console.log("📡 Fetching Deepgram config from /api/deepgram-config...");
    const configRes = await fetch("/api/deepgram-config", { method: "GET" });
    if (!configRes.ok) {
      const errorText = await configRes.text().catch(() => "");
      throw new Error(`Deepgram config request failed (${configRes.status}): ${errorText}`);
    }
    const configJson = (await configRes.json()) as {
      token?: string; // JWT token or API key
      apiKey?: string; // Alternative: API key for Sec-WebSocket-Protocol
      audioMode?: "hifi" | "telephony";
      thinkModel?: string;
      model?: string;
      voice?: string;
      language?: string;
      error?: string;
    };
    
    if (configJson.error) {
      console.error("❌ Server returned error:", configJson.error);
      throw new Error(configJson.error);
    }
    
    // Prefer API key for Sec-WebSocket-Protocol (more reliable for Voice Agent API)
    const authToken = configJson.apiKey || configJson.token;
    if (!authToken) {
      console.error("❌ No token or API key in response:", configJson);
      throw new Error("Authentication token not provided by server");
    }
    
    this.config = {
      token: authToken, // Can be API key or JWT token
      model: config.model ?? configJson.model,
      voice: config.voice ?? configJson.voice,
      language: config.language ?? configJson.language ?? "fr",
      audioMode: configJson.audioMode,
      thinkModel: configJson.thinkModel,
    };

    // Apply audio mode (defaults to hifi)
    this.audioMode = this.config.audioMode === "telephony" ? "telephony" : "hifi";
    if (this.audioMode === "telephony") {
      // Phone call style
      this.sampleRate = 8000;
      this.outputSampleRate = 8000;
      this.outputEncoding = "mulaw";
    } else {
      // Natural speech
      this.sampleRate = 24000;
      this.outputSampleRate = 24000;
      this.outputEncoding = "linear16";
    }

    // Create WebSocket connection
    // Deepgram Voice Agent API accepts either:
    // 1. API key via Sec-WebSocket-Protocol (recommended for browser, per Twilio example)
    // 2. JWT token via query parameter
    if (!this.config.token || this.config.token.length === 0) {
      throw new Error("Authentication token is empty or invalid");
    }
    
    // Determine if we have an API key or JWT token
    const tokenParts = this.config.token.split('.');
    const isJWT = tokenParts.length === 3;
    const isApiKeyAuth = !isJWT;
    
    console.log(`✅ ${isApiKeyAuth ? 'API key' : 'JWT token'} received from server, length:`, this.config.token.length);
    
    let wsUrl: string;
    let protocols: string[] | undefined;
    
    if (isApiKeyAuth) {
      // Use Sec-WebSocket-Protocol for API keys (per Deepgram docs and Twilio example)
      wsUrl = `wss://agent.deepgram.com/v1/agent/converse`;
      protocols = ["token", this.config.token];
      console.log("🔌 Connecting to Deepgram WebSocket:");
      console.log("  URL:", wsUrl);
      console.log("  Authentication: Sec-WebSocket-Protocol (API key)");
      console.log("  API key length:", this.config.token.length);
      console.log("  API key preview:", this.config.token.substring(0, 10) + "...");
    } else {
      // Use query parameter for JWT tokens
      wsUrl = `wss://agent.deepgram.com/v1/agent/converse?token=${encodeURIComponent(this.config.token)}`;
      console.log("🔌 Connecting to Deepgram WebSocket:");
      console.log("  URL:", wsUrl.replace(this.config.token, "[TOKEN_REDACTED]"));
      console.log("  Authentication: JWT token via query parameter");
      console.log("  Token length:", this.config.token.length);
      console.log("  Token preview:", this.config.token.substring(0, 20) + "...");
      
      // Try to decode JWT payload to check expiration and scopes
      try {
        const payload = JSON.parse(atob(tokenParts[1]));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          console.warn("⚠️ JWT token appears to be expired. Exp:", new Date(payload.exp * 1000), "Now:", new Date());
        } else if (payload.exp) {
          console.log("✅ JWT token expiration check:", new Date(payload.exp * 1000), "(valid)");
        }
        console.log("JWT payload (decoded):", { 
          ...payload, 
          exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'no exp',
          scopes: payload.scopes || payload.scope || 'no scopes found',
          iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'no iat',
        });
        
        // Check if token has required scopes
        const scopes = payload.scopes || payload.scope || [];
        if (Array.isArray(scopes) && !scopes.includes('agent:converse')) {
          console.warn("⚠️ JWT token may not have 'agent:converse' scope. Found scopes:", scopes);
        } else if (Array.isArray(scopes) && scopes.includes('agent:converse')) {
          console.log("✅ JWT token has 'agent:converse' scope");
        }
      } catch (e) {
        console.warn("⚠️ Could not decode JWT payload (non-critical):", e);
      }
    }
    
    console.log("Creating WebSocket connection...");
    this.ws = new WebSocket(wsUrl, protocols);
    // Ensure binary frames (agent audio) are delivered as ArrayBuffer when possible.
    // Some browsers still deliver as Blob; we handle that too.
    this.ws.binaryType = "arraybuffer";

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("Failed to create WebSocket"));
        return;
      }

      let errorOccurred = false;
      let welcomeReceived = false;
      let settingsSent = false;

      // Set a timeout for connection establishment
      const connectionTimeout = setTimeout(() => {
        if (!welcomeReceived && !errorOccurred) {
          console.error("⏱️ Connection timeout: No Welcome message received within 10 seconds");
          errorOccurred = true;
          if (this.ws) {
            this.ws.close();
          }
          reject(new Error("Connection timeout: Deepgram did not send Welcome message within 10 seconds. This may indicate an authentication or network issue."));
        }
      }, 10000); // 10 second timeout

      this.ws.onopen = () => {
        if (errorOccurred) {
          console.error("❌ WebSocket opened but error already occurred");
          clearTimeout(connectionTimeout);
          return;
        }
        console.log("✅ WebSocket opened successfully!");
        console.log("  ReadyState:", this.ws?.readyState);
        console.log("  Protocol:", this.ws?.protocol || "none");
        console.log("  Extensions:", this.ws?.extensions || "none");
        console.log("  Waiting for Welcome message from Deepgram...");
        // Don't send Settings yet - wait for Welcome per Deepgram docs
      };

      this.ws.onerror = (event) => {
        errorOccurred = true;
        // WebSocket error events don't provide detailed error information
        // The actual error will be available in onclose event
        console.error("❌ WebSocket error event:", event);
        console.error("  WebSocket state:", this.ws?.readyState, `(${this.ws?.readyState === 0 ? 'CONNECTING' : this.ws?.readyState === 1 ? 'OPEN' : this.ws?.readyState === 2 ? 'CLOSING' : 'CLOSED'})`);
        console.error("  WebSocket URL:", this.ws?.url?.replace(this.config?.token || "", "[TOKEN_REDACTED]"));
        // Note: onclose will be called after onerror with more details
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        // Only reject if we haven't resolved yet (connection failed before Welcome)
        if (!welcomeReceived) {
          let errorMessage = "";
          const closeReason = event.reason || "none";
          
          console.error("WebSocket closed before Welcome:", {
            code: event.code,
            reason: closeReason,
            wasClean: event.wasClean,
            tokenLength: this.config?.token?.length || 0,
            welcomeReceived,
            settingsSent,
            errorOccurred,
          });
          
          if (event.code === 1006) {
            errorMessage = `WebSocket connection failed (code: ${event.code}). ` +
              `Connection closed before Welcome message. ` +
              `This may be due to: invalid/expired JWT token, malformed Settings message, or Deepgram service issue. ` +
              `Reason: ${closeReason}. ` +
              `Token length: ${this.config?.token?.length || 0} chars. ` +
              `Settings sent: ${settingsSent}, Error occurred: ${errorOccurred}`;
          } else if (event.code === 1002) {
            errorMessage = `WebSocket protocol error (code: ${event.code}). ` +
              `The JWT token format may be incorrect. ` +
              `Reason: ${closeReason}`;
          } else if (event.code === 1008) {
            errorMessage = `WebSocket connection closed due to policy violation (code: ${event.code}). ` +
              `The JWT token may be invalid, expired, or lack required permissions. ` +
              `Reason: ${closeReason}`;
          } else if (event.code === 1003) {
            errorMessage = `WebSocket connection closed due to invalid data (code: ${event.code}). ` +
              `The Settings message may be malformed. Check console for Settings JSON. ` +
              `Reason: ${closeReason}`;
          } else {
            errorMessage = `WebSocket connection closed unexpectedly (code: ${event.code}, reason: ${closeReason})`;
          }
          
          // Only reject if we haven't already resolved
          if (!welcomeReceived) {
            reject(new Error(errorMessage));
          }
        } else {
          // Connection closed after successful connection - this is normal on disconnect
          console.log("WebSocket closed after successful connection (normal disconnect)");
        }
      };

      this.ws.onmessage = async (event) => {
        // Binary frames can arrive as ArrayBuffer or Blob depending on browser.
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          await this.handleMessage(event);
          return;
        }

        try {
          if (typeof event.data !== "string") {
            // Defensive: should not happen, but avoids JSON.parse([object Object]/Blob)
            await this.handleMessage(event);
            return;
          }

          const message = JSON.parse(event.data) as DeepgramMessage;
          const type = message.type;

          if (type === "Welcome") {
            console.log("✅ Received Welcome message from Deepgram");
            welcomeReceived = true;
            clearTimeout(connectionTimeout);
            
            // Send Settings AFTER Welcome (per Deepgram docs examples)
            console.log("Sending Settings after Welcome...");
            if (this.ws && this.ws.readyState === WebSocket.OPEN && !errorOccurred) {
              this.sendSettings();
              settingsSent = true;
            }
            
            // Start keepalive after Welcome
            this.startKeepAlive();
            // Resolve only after Welcome is received
            resolve();
            return;
          }

          if (type === "SettingsApplied") {
            console.log("Settings applied successfully");
          }

          if (type === "Error") {
            // V1 Error format: uses 'description' and 'code' fields (per migration guide)
            const errorMsg = (message as { description?: string; message?: string; err_msg?: string }).description
              || (message as { message?: string }).message 
              || (message as { err_msg?: string }).err_msg 
              || JSON.stringify(message);
            const errorCode = (message as { code?: string; err_code?: string }).code
              || (message as { err_code?: string }).err_code;
            console.error("❌ Deepgram error:", { code: errorCode, description: errorMsg, full: message });
            errorOccurred = true;
            reject(new Error(`Deepgram error${errorCode ? ` (${errorCode})` : ""}: ${errorMsg}`));
            return;
          }

          if (type === "Warning") {
            console.warn("Deepgram warning:", message);
          }

          // Handle other messages normally
          await this.handleMessage(event);
        } catch (error) {
          console.error("Error parsing message:", error);
          // Still handle as message (might be binary or other format)
          await this.handleMessage(event);
        }
      };
    });

    // Set up audio capture
    this.setupAudioCapture(stream);
  }

  disconnect(): Promise<void> {
    // Stop audio processing
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    if (this.playbackAudioContext) {
      try {
        this.playbackAudioContext.close();
      } catch {}
      this.playbackAudioContext = null;
    }

    // Close WebSocket
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;

    // Stop local stream tracks
    for (const t of this.localStream?.getTracks() ?? []) {
      try {
        t.stop();
      } catch {}
    }
    this.localStream = null;

    // Clear audio queue
    this.audioQueue = [];
    this.isPlaying = false;
    
    // Stop keepalive
    this.stopKeepAlive();
    
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendMessage(instructions: string, _config?: ResponseConfig): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.awaitingResponse) return;

    // IMPORTANT: Don't use InjectAgentMessage here, because it causes the agent to literally speak
    // the provided text (which in our app is often a long system prompt/brevity instruction).
    // Instead: update the prompt for this response, then nudge the agent with a short user message.
    this.ws.send(JSON.stringify({ type: "UpdatePrompt", prompt: instructions } satisfies DeepgramMessage));

    const lang = (this.config?.language || "fr").toLowerCase();
    const nudge = lang.startsWith("fr") ? "D'accord." : "OK.";
    const msg: InjectUserMessage = { type: "InjectUserMessage", content: nudge };
    this.ws.send(JSON.stringify(msg));
  }

  updateSession(instructions: string, voice?: string): void {
    // Store instructions for Settings message (sent on connect)
    this.initialInstructions = instructions;
    
    // If already connected, update prompt
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Update prompt (system instructions)
      const promptMessage: DeepgramMessage = {
        type: "UpdatePrompt",
        prompt: instructions,
      };

      this.ws.send(JSON.stringify(promptMessage));

      // Update voice if provided
      if (voice) {
        // Determine provider type from voice string
        const isElevenLabs = voice.startsWith("eleven_");
        const speakMessage: UpdateSpeakMessage = {
          type: "UpdateSpeak",
          speak: {
            provider: isElevenLabs ? {
              type: "eleven_labs",
              model_id: "eleven_multilingual_v2",
              language_code: this.config?.language || "fr",
            } : {
              type: "deepgram",
              model: voice, // Deepgram Aura model name
            },
          },
        };

        this.ws.send(JSON.stringify(speakMessage));
      }
    }
  }

  getRemoteAudioElement(): HTMLAudioElement | null {
    return this.remoteAudioElement;
  }

  setRemoteAudioElement(element: HTMLAudioElement | null): void {
    this.remoteAudioElement = element;
  }

  private sendSettings(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.config) return;

    // Use Deepgram's TTS for French (PlayHT is not supported in Voice Agent API)
    // For French, we can use Deepgram's Aura models or Eleven Labs
    // Defaulting to Deepgram Aura for simplicity
    const ttsProvider = this.config.voice?.startsWith("eleven_") ? "eleven_labs" : "deepgram";
    const lang = (this.config.language || "en").toLowerCase();
    // Deepgram Aura-2 French voices (docs): aura-2-agathe-fr, aura-2-hector-fr
    const defaultVoice =
      lang.startsWith("fr") ? "aura-2-agathe-fr" : "aura-2-thalia-en";
    const requestedVoice = this.config.voice;
    // If language is French but env provided an English voice, override to a French voice for natural output.
    const ttsModel =
      lang.startsWith("fr") && requestedVoice && requestedVoice.endsWith("-en")
        ? defaultVoice
        : (requestedVoice || defaultVoice);

    const settings: SettingsMessage = {
      type: "Settings",
      audio: {
        input: {
          encoding: this.audioMode === "telephony" ? "mulaw" : "linear16",
          sample_rate: this.sampleRate,
        },
        output: {
          encoding: this.outputEncoding,
          sample_rate: this.outputSampleRate,
          // Explicitly request raw PCM (no container). This avoids header/click/static issues.
          // Docs: Settings example uses container "none".
          container: "none",
        },
      },
      agent: {
        // Use language code like "fr" / "en" (not "fr-FR") for best compatibility.
        language: (this.config.language || "fr").slice(0, 2).toLowerCase(),
        listen: {
          provider: {
            type: "deepgram",
            // Voice Agent settings uses agent.language for language selection; model should be STT model name.
            // Use Nova-3 by default for better real-time quality.
            model: this.config.model || "nova-3",
            smart_format: true,
          },
        },
        think: {
          provider: {
            type: "open_ai",
            model: (this.config.thinkModel as SettingsMessage["agent"]["think"]["provider"]["model"]) ?? "gpt-4o-mini",
          },
          prompt: this.initialInstructions || "Vous êtes un examinateur TEF Canada. Dites 'Bonjour, commençons l'examen.'",
        },
        speak: {
          provider: ttsProvider === "eleven_labs" ? {
            type: "eleven_labs",
            model_id: "eleven_multilingual_v2", // Supports French
            language_code: "fr",
          } : {
            type: "deepgram",
            model: ttsModel, // Deepgram Aura model
          },
        },
        greeting: "Bonjour, commençons l'examen.",
      },
    };

    const settingsJson = JSON.stringify(settings);
    console.log("✅ Sending Settings:", settingsJson);
    console.log("Settings object:", settings);
    
    try {
      this.ws.send(settingsJson);
      console.log("✅ Settings sent successfully");
    } catch (error) {
      console.error("❌ Failed to send Settings:", error);
      throw error;
    }
  }

  private setupAudioCapture(stream: MediaStream): void {
    try {
      // Create AudioContext with fixed sample rate to match Settings
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: this.sampleRate,
      });
      
      // Use the actual sample rate from the context (may differ if browser doesn't support requested rate)
      const actualSampleRate = this.audioContext.sampleRate;
      if (actualSampleRate !== this.sampleRate) {
        console.warn(`AudioContext sample rate ${actualSampleRate} differs from requested ${this.sampleRate}. Resampling may be needed.`);
        // We'll resample in JS to match Settings.audio.input.sample_rate.
      }
      
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      
      // Create script processor for audio capture
      // Note: ScriptProcessorNode is deprecated but works for this use case
      // In production, consider using AudioWorkletNode
      // Smaller buffer => lower latency. 1024 @ 48kHz ~= 21ms.
      const bufferSize = 1024;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      this.processorNode.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Resample to match Settings.audio.input.sample_rate (phone-call-like pacing)
        const resampledPcm16 = this.resampleFloat32ToInt16(inputData, actualSampleRate, this.sampleRate);

        // Send in fixed 20ms frames to reduce jitter and improve latency.
        const frameSamples = Math.max(1, Math.round(this.sampleRate * 0.02));

        let bytesToAppend: Uint8Array;
        if (this.audioMode === "telephony") {
          // 8kHz mulaw: 1 byte per sample
          bytesToAppend = this.pcm16ToMuLaw(resampledPcm16);
        } else {
          // 24k linear16: 2 bytes per sample (little-endian)
          bytesToAppend = new Uint8Array(resampledPcm16.buffer, resampledPcm16.byteOffset, resampledPcm16.byteLength);
        }

        // Append bytes
        if (this.pendingBytes.length === 0) {
          this.pendingBytes = bytesToAppend;
        } else {
          const merged = new Uint8Array(this.pendingBytes.length + bytesToAppend.length);
          merged.set(this.pendingBytes, 0);
          merged.set(bytesToAppend, this.pendingBytes.length);
          this.pendingBytes = merged;
        }

        const frameByteLength = this.audioMode === "telephony" ? frameSamples : frameSamples * 2;
        while (this.pendingBytes.length >= frameByteLength) {
          const frame = this.pendingBytes.slice(0, frameByteLength);
          this.pendingBytes = this.pendingBytes.slice(frameByteLength);
          this.ws.send(frame.buffer);
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
    } catch (error) {
      console.error("Failed to setup audio capture:", error);
      if (this.errorCallback) {
        this.errorCallback(new Error(`Audio setup failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  private resampleFloat32ToInt16(input: Float32Array, inputRate: number, outputRate: number): Int16Array {
    // If rates match, just convert.
    if (inputRate === outputRate) {
      const out = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return out;
    }

    // Linear interpolation resampling (good enough for speech; low CPU).
    const ratio = inputRate / outputRate;
    const outLength = Math.max(1, Math.floor(input.length / ratio));
    const out = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(input.length - 1, i0 + 1);
      const frac = idx - i0;
      const sample = input[i0] * (1 - frac) + input[i1] * frac;
      const s = Math.max(-1, Math.min(1, sample));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  // ---- Telephony μ-law helpers ----
  private pcm16ToMuLaw(pcm: Int16Array): Uint8Array {
    const out = new Uint8Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      out[i] = this.linear16ToMuLawSample(pcm[i]);
    }
    return out;
  }

  private muLawToPcm16(mulaw: Uint8Array): Int16Array {
    const out = new Int16Array(mulaw.length);
    for (let i = 0; i < mulaw.length; i++) {
      out[i] = this.muLawToLinear16Sample(mulaw[i]);
    }
    return out;
  }

  // Standard G.711 μ-law encode/decode.
  // Based on ITU-T G.711 with common constants.
  private linear16ToMuLawSample(sample: number): number {
    const BIAS = 0x84;
    const CLIP = 32635;

    let s = sample;
    let sign = 0;
    if (s < 0) {
      sign = 0x80;
      s = -s;
      if (s < 0) s = CLIP; // handle -32768
    }
    if (s > CLIP) s = CLIP;
    s = s + BIAS;

    // Determine exponent.
    let exponent = 7;
    for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }

    const mantissa = (s >> (exponent + 3)) & 0x0f;
    const ulawByte = ~(sign | (exponent << 4) | mantissa);
    return ulawByte & 0xff;
  }

  private muLawToLinear16Sample(ulawByte: number): number {
    const BIAS = 0x84;
    const u = (~ulawByte) & 0xff;

    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;

    let s = ((mantissa << 3) + BIAS) << exponent;
    s -= BIAS;
    return sign ? -s : s;
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      // Check if it's binary (audio data)
      if (event.data instanceof ArrayBuffer) {
        await this.handleAudioData(event.data);
        return;
      }

      // Some browsers deliver binary frames as Blob even when binaryType is set.
      if (event.data instanceof Blob) {
        // Voice Agent binary frames are raw audio bytes; treat as audio.
        const buffer = await event.data.arrayBuffer();
        await this.handleAudioData(buffer);
        return;
      }

      // Parse JSON message
      if (typeof event.data !== "string") {
        throw new Error(`Unexpected WebSocket message type: ${Object.prototype.toString.call(event.data)}`);
      }

      const message = JSON.parse(event.data) as DeepgramMessage;
      const type = message.type;

      switch (type) {
        case "Welcome":
          // Connection established (handled in onmessage before resolve)
          break;

        case "SettingsApplied":
          // Settings have been applied (handled in onmessage)
          break;

        case "ConversationText":
          // Handle conversation text (transcript)
          // Adjust parsing based on actual server message shape
          const conversationMsg = message as { text?: string; content?: string; role?: string };
          const text = conversationMsg.text ?? conversationMsg.content ?? "";
          const roleRaw = conversationMsg.role ?? "assistant";
          const role: "user" | "assistant" = roleRaw === "user" ? "user" : "assistant";
          if (text && this.transcriptCallback) {
            this.transcriptCallback(text, role);
          }
          break;

        case "UserStartedSpeaking":
          // User started speaking
          break;

        case "AgentStartedSpeaking":
          // Agent started speaking (response started)
          this.awaitingResponse = true;
          if (this.responseStartCallback) {
            this.responseStartCallback();
          }
          break;

        case "AgentAudioDone":
          // Agent finished speaking (response ended)
          this.awaitingResponse = false;
          if (this.responseEndCallback) {
            this.responseEndCallback();
          }
          break;

        case "AgentThinking":
          // Agent is processing
          break;

        case "Error":
          // Handle error
          // V1 Error format: uses 'description' and 'code'
          const errorMsg =
            ("description" in message && typeof (message as { description?: unknown }).description === "string"
              ? ((message as unknown as { description: string }).description)
              : ("message" in message && typeof (message as { message?: unknown }).message === "string"
                ? ((message as unknown as { message: string }).message)
                : JSON.stringify(message)));
          if (this.errorCallback) {
            this.errorCallback(new Error(errorMsg));
          }
          break;

        case "Warning":
          // Handle warning (non-fatal)
          console.warn("Deepgram warning:", message);
          break;

        default:
          // Unknown message type
          console.log("Unknown Deepgram message type:", type, message);
      }
    } catch (error) {
      console.error("Error handling Deepgram message:", error);
      if (this.errorCallback) {
        this.errorCallback(new Error(`Message handling failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  private async handleAudioData(data: ArrayBuffer): Promise<void> {
    // Deepgram may send raw PCM (preferred) or WAV-framed PCM depending on settings.
    // If WAV header is present, strip it so playback uses raw PCM.
    // Agent audio output is raw bytes (container none). Decode based on Settings.audio.output.encoding.
    const raw = this.stripWavHeaderIfPresent(data);
    this.audioQueue.push(raw);
    
    // Start playback if not already playing
    if (!this.isPlaying) {
      this.startAudioPlayback();
    }
  }

  private async startAudioPlayback(): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      if (!this.playbackAudioContext) {
        this.playbackAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      // Initialize scheduling cursor
      if (this.nextPlaybackTime < this.playbackAudioContext.currentTime) {
        this.nextPlaybackTime = this.playbackAudioContext.currentTime;
      }

      // Jitter-buffer style scheduling: schedule chunks back-to-back using nextPlaybackTime
      while (this.audioQueue.length > 0) {
        const audioData = this.audioQueue.shift();
        if (!audioData) continue;

        const float32Array = this.decodeAgentAudioToFloat32(audioData);

        // Create buffer at the *source* sample rate so the browser resamples correctly.
        const audioBuffer = this.playbackAudioContext.createBuffer(
          1,
          float32Array.length,
          this.outputSampleRate,
        );
        audioBuffer.copyToChannel(float32Array, 0);

        const source = this.playbackAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.playbackAudioContext.destination);

        // Schedule slightly in the future to avoid underruns due to main-thread jitter.
        const startAt = Math.max(
          this.playbackAudioContext.currentTime + 0.05,
          this.nextPlaybackTime,
        );
        source.start(startAt);
        this.nextPlaybackTime = startAt + audioBuffer.duration;
      }

      // Wait until scheduled audio finishes (or new chunks arrive and restart playback)
      while (this.playbackAudioContext.currentTime + 0.05 < this.nextPlaybackTime) {
        await new Promise((r) => setTimeout(r, 20));
        // If new audio arrived, keep scheduling it in this same run.
        while (this.audioQueue.length > 0) {
          const audioData = this.audioQueue.shift();
          if (!audioData) break;

          const float32Array = this.decodeAgentAudioToFloat32(audioData);

          const audioBuffer = this.playbackAudioContext.createBuffer(
            1,
            float32Array.length,
            this.outputSampleRate,
          );
          audioBuffer.copyToChannel(float32Array, 0);

          const source = this.playbackAudioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.playbackAudioContext.destination);

          const startAt = Math.max(
            this.playbackAudioContext.currentTime + 0.05,
            this.nextPlaybackTime,
          );
          source.start(startAt);
          this.nextPlaybackTime = startAt + audioBuffer.duration;
        }
      }
    } catch (error) {
      console.error("Audio playback error:", error);
      if (this.errorCallback) {
        this.errorCallback(new Error(`Audio playback failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    } finally {
      this.isPlaying = false;
    }
  }

  private allocFloat32(length: number): Float32Array<ArrayBuffer> {
    // Use an explicit ArrayBuffer and return the correctly-parameterized typed array.
    return new Float32Array(new ArrayBuffer(length * 4)) as unknown as Float32Array<ArrayBuffer>;
  }

  private decodeAgentAudioToFloat32(audioData: ArrayBuffer): Float32Array<ArrayBuffer> {
    if (this.outputEncoding === "mulaw") {
      const mulaw = new Uint8Array(audioData);
      const pcm16 = this.muLawToPcm16(mulaw);
      const f32 = this.allocFloat32(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        f32[i] = pcm16[i] / 32768.0;
      }
      return f32;
    }

    // linear16 fallback
    const int16Array = new Int16Array(audioData);
    const f32 = this.allocFloat32(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      f32[i] = int16Array[i] / 32768.0;
    }
    return f32;
  }

  private stripWavHeaderIfPresent(data: ArrayBuffer): ArrayBuffer {
    // WAV header is typically 44 bytes and starts with "RIFF"...."WAVE"
    if (data.byteLength < 44) return data;
    const u8 = new Uint8Array(data);

    // "RIFF"
    if (u8[0] !== 0x52 || u8[1] !== 0x49 || u8[2] !== 0x46 || u8[3] !== 0x46) return data;
    // "WAVE" at offset 8
    if (u8[8] !== 0x57 || u8[9] !== 0x41 || u8[10] !== 0x56 || u8[11] !== 0x45) return data;

    // Find "data" chunk to know where PCM begins. This is safer than assuming 44 bytes.
    // Minimal parsing: scan for ASCII "data".
    for (let i = 12; i + 8 <= u8.length; i++) {
      if (u8[i] === 0x64 && u8[i + 1] === 0x61 && u8[i + 2] === 0x74 && u8[i + 3] === 0x61) {
        // data chunk size follows; PCM bytes start at i+8
        const start = i + 8;
        if (start >= u8.length) return data;
        return u8.slice(start).buffer;
      }
    }

    // If we can't find data chunk, fall back to stripping standard header length.
    return u8.slice(44).buffer;
  }

  private startKeepAlive(): void {
    if (!this.ws) return;
    this.keepAliveInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 15000); // Send keepalive every 15 seconds
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval !== null) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}

