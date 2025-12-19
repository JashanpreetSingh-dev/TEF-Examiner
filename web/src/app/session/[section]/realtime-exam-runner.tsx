"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Scenario } from "@/lib/kb";
import { EvaluationPanel } from "@/components/session/EvaluationPanel";
import { SessionControls } from "@/components/session/SessionControls";
import { SessionStatusPanel } from "@/components/session/SessionStatusPanel";
import { TranscriptPanel } from "@/components/session/TranscriptPanel";
import type { ConnState, Phase, TranscriptLine } from "@/components/session/types";
import { makeBrevityInstruction, makeExamInstructions, makePrebrief } from "@/lib/prompts/examiner";



function randomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

type RunnerMode = "live" | "results";
type StopReason = "user_stop" | "timeout";
type EvaluationStatus = "idle" | "loading" | "done" | "error";

function isRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object";
}

function isIgnorableRealtimeError(evt: unknown): boolean {
  if (!isRecord(evt)) return false;
  const err = isRecord(evt.error) ? evt.error : null;
  const code = err && typeof err.code === "string" ? err.code : undefined;
  if (code === "conversation_already_has_active_response") return true;

  const msg = String(err && "message" in err ? (err as Record<string, unknown>).message ?? "" : "");
  if (msg.includes("Conversation already has an active response in progress")) return true;

  return false;
}

type SessionSummary = {
  endedAtMs: number;
  endedReason: StopReason;
  finalTranscript: TranscriptLine[];
  finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
  evaluation: unknown | null;
  evaluationStatus: EvaluationStatus;
  evaluationError: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function toEvalTranscript(snapshot: TranscriptLine[]) {
  return snapshot
    .filter((t): t is TranscriptLine & { role: "user" | "assistant" } => t.role === "user" || t.role === "assistant")
    .map((t) => ({ role: t.role, text: t.text }));
}

function toExaminerLines(snapshot: TranscriptLine[]) {
  return snapshot.filter((t): t is TranscriptLine & { role: "assistant" } => t.role === "assistant");
}

export function RealtimeExamRunner(props: { scenario: Scenario; imageUrl: string }) {
  const { scenario } = props;
  const router = useRouter();

  const [mode, setMode] = useState<RunnerMode>("live");
  const [state, setState] = useState<ConnState>("idle");
  const [phase, setPhase] = useState<Phase>("none");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(scenario.time_limit_sec);
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number>(60);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const timerRef = useRef<number | null>(null);
  const prepTimerRef = useRef<number | null>(null);
  const timeoutHandledRef = useRef(false);
  const phaseRef = useRef<Phase>("none");
  const examStartedRef = useRef(false);
  const awaitingResponseRef = useRef(false);
  const warn60SentRef = useRef(false);
  const warn10SentRef = useRef(false);
  const sessionSummaryRef = useRef<SessionSummary | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMimeRef = useRef<string>("");

  const [ocrStatus, setOcrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ocrData, setOcrData] = useState<null | { raw_text: string; facts: Array<{ key: string; value: string }> }>(null);
  const prebrief = useMemo(() => makePrebrief(scenario), [scenario]);

  const appendLine = useCallback((line: Omit<TranscriptLine, "id">) => {
    setTranscript((prev) => [...prev, { id: randomId(), ...line }]);
  }, []);

  const upsertAssistantDelta = useCallback((delta: string) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") {
        return [...prev, { id: randomId(), role: "assistant", text: delta }];
      }
      return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
    });
  }, []);

  const upsertUserText = useCallback((text: string) => {
    if (!text.trim()) return;
    appendLine({ role: "user", text });
  }, [appendLine]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopPrepTimer = useCallback(() => {
    if (prepTimerRef.current) {
      window.clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setSecondsLeft(scenario.time_limit_sec);
    timeoutHandledRef.current = false;
    warn60SentRef.current = false;
    warn10SentRef.current = false;
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
  }, [scenario.time_limit_sec, stopTimer]);

  const startPrepTimer = useCallback(() => {
    stopPrepTimer();
    setPrepSecondsLeft(60);
    prepTimerRef.current = window.setInterval(() => {
      setPrepSecondsLeft((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
  }, [stopPrepTimer]);

  const teardownRealtime = useCallback(() => {
    stopTimer();
    stopPrepTimer();
    setPhase("none");
    phaseRef.current = "none";
    examStartedRef.current = false;
    awaitingResponseRef.current = false;
    warn60SentRef.current = false;
    warn10SentRef.current = false;

    try {
      dcRef.current?.close();
    } catch {}
    dcRef.current = null;

    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    for (const t of localStreamRef.current?.getTracks() ?? []) {
      try {
        t.stop();
      } catch {}
    }
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
      } catch {}
      const stream = remoteAudioRef.current.srcObject as MediaStream | null;
      remoteAudioRef.current.srcObject = null;
      for (const t of stream?.getTracks?.() ?? []) {
        try {
          t.stop();
        } catch {}
      }
    }
  }, [stopPrepTimer, stopTimer]);

  const startRecording = useCallback((stream: MediaStream) => {
    try {
      if (recorderRef.current) return;
      recordedChunksRef.current = [];

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      recordingMimeRef.current = mimeType;

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      // Small timeslice keeps memory stable for long sessions.
      rec.start(1000);
    } catch {
      recorderRef.current = null;
      recordedChunksRef.current = [];
      recordingMimeRef.current = "";
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec) return null;

    if (rec.state === "inactive") {
      recorderRef.current = null;
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      const type = recordingMimeRef.current || chunks[0]?.type || "audio/webm";
      return chunks.length ? new Blob(chunks, { type }) : null;
    }

    const done = new Promise<void>((resolve) => {
      const prev = rec.onstop;
      rec.onstop = (ev: Event) => {
        try {
          if (typeof prev === "function") prev.call(rec, ev);
        } finally {
          resolve();
        }
      };
    });

    try {
      rec.stop();
    } catch {}

    await done;

    recorderRef.current = null;
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];
    const type = recordingMimeRef.current || chunks[0]?.type || "audio/webm";
    return chunks.length ? new Blob(chunks, { type }) : null;
  }, []);

  const transcribeCandidateAudio = useCallback(async (audio: Blob | null): Promise<string> => {
    if (!audio) return "";
    try {
      const fd = new FormData();
      fd.set("audio", audio, "candidate.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!res.ok) return "";
      const json = (await res.json().catch(() => null)) as null | { text?: unknown };
      return typeof json?.text === "string" ? json.text.trim() : "";
    } catch {
      return "";
    }
  }, []);

  const sendEvent = useCallback((evt: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(evt));
  }, []);

  const maybeRequestModelResponse = useCallback(
    (reason: "start_eo1" | "user_turn" | "warning_60" | "warning_10") => {
      if (phaseRef.current !== "exam") return;
      const isWarning = reason === "warning_60" || reason === "warning_10";
      // Never create a new response if one is already streaming.
      // (OpenAI Realtime will emit a harmless error, but we don't want the UI to show it.)
      if (awaitingResponseRef.current) return;
      if (!isWarning) {
        awaitingResponseRef.current = true;
      }

      const common = {
        type: "response.create" as const,
        response: {
          modalities: ["audio", "text"] as const,
        },
      };

      const instructionForReason =
        reason === "warning_60"
          ? "Il reste une minute. Dites une phrase courte pour inviter le candidat à conclure."
          : reason === "warning_10"
            ? "Il reste dix secondes. Dites une phrase très courte pour demander de conclure immédiatement."
            : scenario.sectionKey === "A"
              ? reason === "start_eo1"
                ? "Démarrez l’appel: dites bonjour et 'je vous écoute' (sans suggérer de questions)."
                : "Répondez uniquement à la question du candidat. Si besoin, posez UNE question de clarification. Ne suggérez jamais quoi demander. Si l'annonce/OCR n'a pas le détail, inventez une réponse plausible et restez cohérent ensuite."
              : "Répondez en tant qu’ami(e) sceptique: choisissez un contre-argument approprié dans la liste fournie (paraphrase OK), puis demandez une justification/exemple. Ne créez pas de nouveaux contre-arguments.";

      const brevity = makeBrevityInstruction(
        scenario.sectionKey,
        reason === "warning_60" || reason === "warning_10" ? "warning" : "generic",
      );

      sendEvent({
        ...common,
        response: {
          ...common.response,
          instructions: `${brevity}\n${instructionForReason}`,
        },
      });
    },
    [scenario.sectionKey, sendEvent],
  );

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setMode("live");
    setSessionSummary(null);
    examStartedRef.current = false;
    awaitingResponseRef.current = false;
    setPhase("none");
    phaseRef.current = "none";
    setSecondsLeft(scenario.time_limit_sec);
    setPrepSecondsLeft(60);
    setIsTranscriptOpen(false);

    try {
      setState("requesting_mic");
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      startRecording(localStream);

      // OCR (EO1 only): extract ad facts so the AI can answer consistently without guessing.
      let ocrSnapshotLocal: null | { raw_text: string; facts: Array<{ key: string; value: string }> } = null;
      if (scenario.sectionKey === "A") {
        setOcrStatus("loading");
        setOcrData(null);
        try {
          const ocrRes = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sectionKey: scenario.sectionKey, id: scenario.id }),
          });
          if (ocrRes.ok) {
            const json = (await ocrRes.json()) as {
              result?: { raw_text: string; facts: Array<{ key: string; value: string }> };
            };
            if (json?.result) {
              ocrSnapshotLocal = { raw_text: json.result.raw_text, facts: json.result.facts ?? [] };
              setOcrData(ocrSnapshotLocal);
              setOcrStatus("ready");
            } else {
              setOcrStatus("error");
            }
          } else {
            setOcrStatus("error");
          }
        } catch {
          setOcrStatus("error");
        }
      } else {
        setOcrStatus("idle");
        setOcrData(null);
      }

      setState("fetching_token");
      const tokenRes = await fetch("/api/realtime-token", { method: "GET" });
      if (!tokenRes.ok) throw new Error(`Token request failed (${tokenRes.status}).`);
      const tokenJson = (await tokenRes.json()) as { token: string; model: string; voice: string };

      setState("connecting");
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio playback
      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          const [stream] = e.streams;
          remoteAudioRef.current.srcObject = stream;
        }
      };

      // Send mic audio
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onmessage = (msg) => {
        try {
          const evt = JSON.parse(String(msg.data)) as { type?: string; [k: string]: unknown };
          const type = evt.type ?? "";

          // Best-effort transcript extraction across Realtime event types:
          if (type === "response.audio_transcript.delta" && typeof evt.delta === "string") {
            upsertAssistantDelta(evt.delta);
          } else if (type === "response.text.delta" && typeof evt.delta === "string") {
            upsertAssistantDelta(evt.delta);
          } else if (type === "response.output_text.delta" && typeof evt.delta === "string") {
            upsertAssistantDelta(evt.delta);
          } else if (type === "response.completed" || type === "response.done" || type === "response.finished") {
            awaitingResponseRef.current = false;
          } else if (type === "error") {
            // Some Realtime errors are expected (e.g., trying to create a response while one is active).
            // Don't surface them to the user or flip the whole UI into an error state.
            if (isIgnorableRealtimeError(evt)) return;
            setError(JSON.stringify(evt));
            setState("error");
          }
        } catch {
          // ignore
        }
      };

      // Negotiate SDP with OpenAI Realtime (WebRTC)
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      if (!pc.localDescription?.sdp) throw new Error("Missing local SDP.");

      const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(tokenJson.model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenJson.token}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
        body: pc.localDescription.sdp,
      });

      if (!sdpRes.ok) {
        const text = await sdpRes.text().catch(() => "");
        throw new Error(`SDP exchange failed (${sdpRes.status}): ${text}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Configure the session once datachannel is open
      await new Promise<void>((resolve) => {
        if (dc.readyState === "open") return resolve();
        dc.onopen = () => resolve();
      });

      const instructions = makeExamInstructions(scenario, ocrSnapshotLocal);
      sendEvent({
        type: "session.update",
        session: {
          instructions,
          voice: tokenJson.voice,
          modalities: ["audio", "text"],
        },
      });

      // Pre-brief (spoken), then 60s prep silence, then exam start.
      setPhase("prebrief");
      phaseRef.current = "prebrief";
      appendLine({ role: "system", text: "Connexion établie. Instructions..." });
      sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: prebrief,
        },
      });

      // Give the model a moment to speak the pre-brief, then start prep countdown.
      await new Promise((r) => setTimeout(r, 3500));

      setPhase("prep");
      phaseRef.current = "prep";
      appendLine({ role: "system", text: "Préparation: 60 secondes (ne pas parler)." });
      startPrepTimer();
      setState("connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
      teardownRealtime();
    }
  }, [
    appendLine,
    teardownRealtime,
    maybeRequestModelResponse,
    prebrief,
    ocrData,
    scenario.id,
    scenario.sectionKey,
    scenario.time_limit_sec,
    sendEvent,
    startPrepTimer,
    startRecording,
    upsertAssistantDelta,
    upsertUserText,
  ]);

  const runEvaluation = useCallback(
    async (summaryOverride?: SessionSummary) => {
      const summary = summaryOverride ?? sessionSummaryRef.current;
      if (!summary) return;
      if (summary.evaluationStatus === "loading") return;
      if (!summary.finalTranscriptForEval.length) {
        setSessionSummary((prev) => (prev ? { ...prev, evaluationStatus: "error", evaluationError: "Transcript vide." } : prev));
        return;
      }

      setSessionSummary((prev) =>
        prev
          ? {
              ...prev,
              evaluationStatus: "loading",
              evaluationError: null,
            }
          : prev,
      );
      setError(null);

      try {
        const payload = {
          scenario: {
            sectionKey: scenario.sectionKey,
            id: scenario.id,
            prompt: scenario.prompt,
            time_limit_sec: scenario.time_limit_sec,
          },
          transcript: summary.finalTranscriptForEval,
        };

        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Evaluation failed (${res.status}): ${text}`);
        }
        const json = await res.json();

        setSessionSummary((prev) => (prev ? { ...prev, evaluation: json, evaluationStatus: "done" } : prev));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSessionSummary((prev) => (prev ? { ...prev, evaluationStatus: "error", evaluationError: msg } : prev));
      }
    },
    [scenario.id, scenario.prompt, scenario.sectionKey, scenario.time_limit_sec],
  );

  const persistAndNavigateToResults = useCallback(
    (payload: {
      endedAtMs: number;
      endedReason: StopReason;
      finalTranscript: TranscriptLine[];
      finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
    }) => {
      const sid = randomId();
      const key = `tef:results:${sid}`;
      const sectionParam = scenario.sectionKey.toLowerCase();

      try {
        const stored = {
          version: 1 as const,
          endedAtMs: payload.endedAtMs,
          endedReason: payload.endedReason,
          scenario: {
            sectionKey: scenario.sectionKey,
            id: scenario.id,
            prompt: scenario.prompt,
            time_limit_sec: scenario.time_limit_sec,
          },
          finalTranscript: payload.finalTranscript,
          finalTranscriptForEval: payload.finalTranscriptForEval,
        };
        sessionStorage.setItem(key, JSON.stringify(stored));
      } catch {
        // If sessionStorage fails, we still navigate (Results page will show a friendly message).
      }

      router.push(`/session/${sectionParam}/results?sid=${encodeURIComponent(sid)}`);
    },
    [router, scenario.id, scenario.prompt, scenario.sectionKey, scenario.time_limit_sec],
  );

  const stopAndMaybeEvaluate = useCallback(async () => {
    setState("stopping");

    const audio = await stopRecording();
    const candidateText = await transcribeCandidateAudio(audio);

    const endedAtMs = Date.now();
    const endedReason: StopReason = "user_stop";

    const baseTranscript = transcriptRef.current.slice();
    const finalTranscript: TranscriptLine[] = candidateText
      ? [...baseTranscript, { id: randomId(), role: "user", text: candidateText }]
      : baseTranscript;

    const examinerLines = toExaminerLines(finalTranscript);
    const transcriptForEval: Array<{ role: "user" | "assistant"; text: string }> = [
      ...examinerLines.map((l) => ({ role: "assistant" as const, text: l.text })),
      ...(candidateText ? [{ role: "user" as const, text: candidateText }] : []),
    ];

    teardownRealtime();
    setState("stopped");

    persistAndNavigateToResults({
      endedAtMs,
      endedReason,
      finalTranscript,
      finalTranscriptForEval: transcriptForEval,
    });
  }, [persistAndNavigateToResults, stopRecording, teardownRealtime, transcribeCandidateAudio]);

  const handleTimeout = useCallback(async () => {
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    setState("stopping");

    try {
      // Timeout -> stop immediately and auto-evaluate based on the stop-time transcript snapshot.
      sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            `${makeBrevityInstruction(scenario.sectionKey, "timeout")}\n` +
            "Le temps est écoulé. Demande au candidat de conclure en 10–15 secondes. Ensuite, conclus toi-même en 1 phrase et annonce la fin de l’épreuve.",
        },
      });
      await sleep(300);
    } finally {
      const audio = await stopRecording();
      const candidateText = await transcribeCandidateAudio(audio);

      const endedAtMs = Date.now();
      const endedReason: StopReason = "timeout";

      const baseTranscript = transcriptRef.current.slice();
      const finalTranscript: TranscriptLine[] = candidateText
        ? [...baseTranscript, { id: randomId(), role: "user", text: candidateText }]
        : baseTranscript;

      const examinerLines = toExaminerLines(finalTranscript);
      const transcriptForEval: Array<{ role: "user" | "assistant"; text: string }> = [
        ...examinerLines.map((l) => ({ role: "assistant" as const, text: l.text })),
        ...(candidateText ? [{ role: "user" as const, text: candidateText }] : []),
      ];

      teardownRealtime();
      setState("stopped");

      persistAndNavigateToResults({
        endedAtMs,
        endedReason,
        finalTranscript,
        finalTranscriptForEval: transcriptForEval,
      });
    }
  }, [persistAndNavigateToResults, sendEvent, stopRecording, teardownRealtime, transcribeCandidateAudio]);

  useEffect(() => {
    // Reset timer if user navigates to another scenario
    setSecondsLeft(scenario.time_limit_sec);
    setPrepSecondsLeft(60);
    setTranscript([]);
    setError(null);
    setMode("live");
    setSessionSummary(null);
    examStartedRef.current = false;
    awaitingResponseRef.current = false;
    setPhase("none");
    phaseRef.current = "none";
    setState("idle");
    teardownRealtime();
    void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id]);

  useEffect(() => {
    if (state !== "connected") return;
    if (phaseRef.current !== "exam") return;
    if (secondsLeft > 0) return;
    void handleTimeout();
  }, [secondsLeft, state, handleTimeout]);

  useEffect(() => {
    if (state !== "connected") return;
    if (phaseRef.current !== "prep") return;
    if (prepSecondsLeft > 0) return;

    // Prep finished -> start the exam timer and (for EO1) initiate the call.
    setPhase("exam");
    phaseRef.current = "exam";
    appendLine({ role: "system", text: "Début de l’épreuve." });
    startTimer();

    if (scenario.sectionKey === "A") {
      examStartedRef.current = true;
      maybeRequestModelResponse("start_eo1");
    } else {
      // EO2: candidate speaks first. We wait for the first candidate turn.
      examStartedRef.current = false;
      appendLine({ role: "system", text: "Vous commencez: parlez en premier pour me convaincre." });
    }
  }, [appendLine, maybeRequestModelResponse, prepSecondsLeft, scenario.sectionKey, startTimer, state]);

  useEffect(() => {
    if (state !== "connected") return;
    if (phaseRef.current !== "exam") return;

    if (secondsLeft === 60 && !warn60SentRef.current) {
      warn60SentRef.current = true;
      maybeRequestModelResponse("warning_60");
    }
    if (secondsLeft === 10 && !warn10SentRef.current) {
      warn10SentRef.current = true;
      maybeRequestModelResponse("warning_10");
    }
  }, [maybeRequestModelResponse, secondsLeft, state]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    sessionSummaryRef.current = sessionSummary;
  }, [sessionSummary]);

  return (
    <div
      className={
        mode === "results"
          ? "flex h-full flex-col gap-4"
          : "mx-auto flex h-full w-full max-w-md flex-col justify-center gap-4"
      }
    >
      <SessionStatusPanel
        mode={mode}
        state={state}
        phase={phase}
        secondsLeft={secondsLeft}
        prepSecondsLeft={prepSecondsLeft}
        endedAtMs={sessionSummary?.endedAtMs}
        endedReason={sessionSummary?.endedReason}
        showOcr={scenario.sectionKey === "A"}
        ocrStatus={ocrStatus}
      />

      <audio ref={remoteAudioRef} autoPlay playsInline />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <SessionControls
        mode={mode}
        onStart={start}
        onEvaluate={mode === "live" ? stopAndMaybeEvaluate : () => void runEvaluation()}
        canStart={state === "idle" || state === "stopped" || state === "error"}
        canEvaluate={
          mode === "live"
            ? state !== "stopping"
            : (sessionSummary?.evaluationStatus ?? "idle") !== "loading" && Boolean(sessionSummary?.finalTranscriptForEval.length)
        }
        evaluationStatus={sessionSummary?.evaluationStatus}
      />

      {mode === "results" ? (
        <TranscriptPanel
          transcript={sessionSummary?.finalTranscript ?? []}
          open={isTranscriptOpen}
          onToggleOpen={setIsTranscriptOpen}
        />
      ) : null}

      {mode === "results" ? (
        <EvaluationPanel
          status={sessionSummary?.evaluationStatus ?? "idle"}
          evaluation={sessionSummary?.evaluation}
          error={sessionSummary?.evaluationError}
        />
      ) : null}
    </div>
  );
}


