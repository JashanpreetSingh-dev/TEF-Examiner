import { ExamSection } from '../types/exam';

export interface RealtimeAPIConfig {
  sessionId: string;
  section: ExamSection;
  onTranscript: (text: string, speaker: 'user' | 'ai') => void;
  onAudioChunk?: (audio: ArrayBuffer) => void;
  onError?: (error: Error) => void;
  onTimeExpired?: () => void;
}

export class RealtimeAPI {
  private ws: WebSocket | null = null;
  private config: RealtimeAPIConfig | null = null;
  private audioContext: AudioContext | null = null;
  private audioQueue: Float32Array[] = [];

  async connect(config: RealtimeAPIConfig): Promise<void> {
    this.config = config;
    
    // Connect to backend WebSocket (which proxies to OpenAI Realtime API)
    const wsUrl = `ws://localhost:8000/api/conversation/ws/${config.sessionId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      // Initialize audio context for playback
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    };

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'session_initialized':
          console.log('Session initialized', message);
          break;
        
        case 'transcript':
          if (this.config?.onTranscript) {
            this.config.onTranscript(message.text, message.speaker);
          }
          break;
        
        case 'audio_chunk':
          if (message.audio) {
            await this.playAudioChunk(message.audio);
          }
          break;
        
        case 'time_expired':
          if (this.config?.onTimeExpired) {
            this.config.onTimeExpired();
          }
          break;
        
        case 'error':
          if (this.config?.onError) {
            this.config.onError(new Error(message.message));
          }
          break;
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (this.config?.onError) {
        this.config.onError(new Error('WebSocket connection error'));
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
    };
  }

  async sendAudioChunk(audioData: ArrayBuffer): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Convert audio to base64 for transmission
      const base64Audio = this.arrayBufferToBase64(audioData);
      this.ws.send(JSON.stringify({
        type: 'audio_chunk',
        audio: base64Audio,
      }));
    }
  }

  async sendTextInput(text: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'text_input',
        text,
      }));
    }
  }

  notifyTimeExpired(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'time_expired',
      }));
    }
  }

  private async playAudioChunk(base64Audio: string): Promise<void> {
    if (!this.audioContext) return;

    try {
      // Decode base64 audio
      const audioData = this.base64ToArrayBuffer(base64Audio);
      const audioBuffer = await this.audioContext.decodeAudioData(audioData);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

