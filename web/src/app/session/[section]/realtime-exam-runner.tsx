"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Scenario } from "@/lib/kb";
import { EvaluationPanel } from "@/components/session/EvaluationPanel";
import { SessionControls } from "@/components/session/SessionControls";
import { SessionStatusPanel } from "@/components/session/SessionStatusPanel";
import { TranscriptPanel } from "@/components/session/TranscriptPanel";
import type { ConnState, Phase, TranscriptLine } from "@/components/session/types";
import { examinerMaxOutputTokens, makeBrevityInstruction, makeExamInstructions } from "@/lib/prompts/examiner";
import type { RunnerMode, SessionSummary, RealtimeDebugStats, StopReason } from "./realtime-exam-runner.types";
import { randomId, sleep, isRecord, isIgnorableRealtimeError, toExaminerLines } from "./realtime-exam-runner.utils";
import { startRecording as startRecordingHelper, stopRecording as stopRecordingHelper, transcribeCandidateAudio } from "./realtime-exam-runner.recording";
import { stopTimer as stopTimerHelper, stopPrepTimer as stopPrepTimerHelper, startTimer as startTimerHelper, startPrepTimer as startPrepTimerHelper } from "./realtime-exam-runner.timers";

export function RealtimeExamRunner(props: { scenario: Scenario; imageUrl: string }) {
  const { scenario } = props;
  const router = useRouter();

  const showTokenDebug = useMemo(() => String(process.env.NEXT_PUBLIC_SHOW_TOKEN_DEBUG ?? "") === "1", []);

  const [mode, setMode] = useState<RunnerMode>("live");
  const [state, setState] = useState<ConnState>("idle");
  const [phase, setPhase] = useState<Phase>("none");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(scenario.time_limit_sec);
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number>(60);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isPrepEnabled, setIsPrepEnabled] = useState(true);

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
  const connectStartedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMimeRef = useRef<string>("");

  const [ocrStatus, setOcrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ocrData, setOcrData] = useState<null | { raw_text: string; facts: Array<{ key: string; value: string }> }>(null);
  const [rtDebug, setRtDebug] = useState<RealtimeDebugStats>({
    dcEvents: 0,
    responsesCreated: 0,
    responsesDone: 0,
  });

  const appendLine = useCallback((line: Omit<TranscriptLine, "id">) => {
    setTranscript((prev) => [...prev, { id: randomId(), ...line }]);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tef:prep60s");
      if (raw === "0") setIsPrepEnabled(false);
      if (raw === "1") setIsPrepEnabled(true);
    } catch {
      // ignore
    }
  }, []);

  const recordingRefs = useMemo(
    () => ({
      recorder: recorderRef,
      chunks: recordedChunksRef,
      mimeType: recordingMimeRef,
    }),
    [],
  );

  const timerRefs = useMemo(
    () => ({
      timer: timerRef,
      prepTimer: prepTimerRef,
      timeoutHandled: timeoutHandledRef,
      warn60Sent: warn60SentRef,
      warn10Sent: warn10SentRef,
    }),
    [],
  );

  const timerSetters = useMemo(
    () => ({
      setSecondsLeft,
      setPrepSecondsLeft,
    }),
    [],
  );

  const stopPrepTimer = useCallback(() => {
    stopPrepTimerHelper(timerRefs);
  }, [timerRefs]);

  const startTimer = useCallback(() => {
    startTimerHelper(scenario.time_limit_sec, timerRefs, timerSetters, stopTimerHelper);
  }, [scenario.time_limit_sec, timerRefs, timerSetters]);

  const startPrepTimer = useCallback(() => {
    startPrepTimerHelper(timerRefs, timerSetters, stopPrepTimerHelper);
  }, [timerRefs, timerSetters]);

  const teardownRealtime = useCallback(() => {
    stopTimerHelper(timerRefs);
    stopPrepTimerHelper(timerRefs);
    setPhase("none");
    phaseRef.current = "none";
    examStartedRef.current = false;
    awaitingResponseRef.current = false;
    timerRefs.warn60Sent.current = false;
    timerRefs.warn10Sent.current = false;

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
  }, [timerRefs]);

  const startRecording = useCallback(
    (stream: MediaStream) => {
      startRecordingHelper(stream, recordingRefs);
    },
    [recordingRefs],
  );

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return stopRecordingHelper(recordingRefs);
  }, [recordingRefs]);

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
                : "Répondez uniquement à la question du candidat. Si le candidat dit seulement « je voudrais des informations / je veux poser des questions / je vous appelle pour me renseigner » sans question précise: répondez uniquement « Très bien, quelle est votre question ? » (ou équivalent) et rien d’autre. INTERDICTION: ne posez pas de questions de relance et ne terminez jamais par une question. Vous pouvez poser UNE SEULE question de clarification uniquement si la demande est ambiguë. Ne suggérez jamais quoi demander. Si l'annonce/OCR n'a pas le détail, inventez une réponse plausible et restez cohérent ensuite."
              : secondsLeft > 20
                ? "Répondez en tant qu'ami(e) sceptique: choisissez un contre-argument approprié dans la liste fournie (paraphrase OK), puis demandez une justification/exemple. Ne créez pas de nouveaux contre-arguments. CONTINUEZ à pousser avec des contre-arguments même si le candidat donne de bonnes réponses — c'est une épreuve de persuasion."
                : "Répondez en tant qu'ami(e) sceptique: vous pouvez commencer à montrer que vous êtes partiellement convaincu(e) (ex: « OK, je vois ton point ») pour permettre une conclusion naturelle, mais continuez à utiliser les contre-arguments de la liste si approprié.";

      const brevity = makeBrevityInstruction(
        scenario.sectionKey,
        reason === "warning_60" || reason === "warning_10" ? "warning" : "generic",
      );
      const maxOutputTokens = examinerMaxOutputTokens(
        scenario.sectionKey,
        reason === "warning_60" || reason === "warning_10" ? "warning" : "generic",
      );
      const budgetHint = `Budget de réponse: ≤${maxOutputTokens} tokens. Conclus avant la limite.`;

      sendEvent({
        ...common,
        response: {
          ...common.response,
          instructions: `${brevity}\n${budgetHint}\n${instructionForReason}`,
          max_output_tokens: maxOutputTokens,
        },
      });

      if (showTokenDebug) {
        setRtDebug((prev) => ({ ...prev, responsesCreated: prev.responsesCreated + 1 }));
      }
    },
    [scenario.sectionKey, secondsLeft, sendEvent, showTokenDebug],
  );

  const connectRealtimeAndStartExam = useCallback(async () => {
    const localStream = localStreamRef.current;
    if (!localStream) {
      setError("Micro non disponible. Cliquez sur Démarrer et autorisez le micro.");
      setState("error");
      return;
    }

    try {
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

          if (showTokenDebug) {
            setRtDebug((prev) => ({
              ...prev,
              dcEvents: prev.dcEvents + 1,
              lastUsage: isRecord(evt) && "usage" in evt ? (evt as Record<string, unknown>).usage : prev.lastUsage,
            }));
          }

          // Default OpenAI turn-taking: no client-side VAD/turn management.
          if (type === "response.completed" || type === "response.done" || type === "response.finished") {
            awaitingResponseRef.current = false;
            if (showTokenDebug) {
              setRtDebug((prev) => ({ ...prev, responsesDone: prev.responsesDone + 1 }));
            }
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

      const instructions = makeExamInstructions(scenario, ocrData);
      sendEvent({
        type: "session.update",
        session: {
          instructions,
          voice: tokenJson.voice,
          modalities: ["audio", "text"],
        },
      });

      setState("connected");

      // Start the exam timer and (for EO1) initiate the call.
      setPhase("exam");
      phaseRef.current = "exam";
      appendLine({ role: "system", text: "Début de l’épreuve." });
      appendLine({ role: "system", text: "Mode audio: le transcript en direct est désactivé." });
      startTimer();

      if (scenario.sectionKey === "A") {
        examStartedRef.current = true;
        maybeRequestModelResponse("start_eo1");
      } else {
        examStartedRef.current = false;
        appendLine({ role: "system", text: "Vous commencez: parlez en premier pour me convaincre." });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
      teardownRealtime();
    }
  }, [
    appendLine,
    maybeRequestModelResponse,
    ocrData,
    scenario,
    sendEvent,
    startTimer,
    teardownRealtime,
    showTokenDebug,
  ]);

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
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStreamRef.current = localStream;
      startRecording(localStream);
      connectStartedRef.current = false;

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

      if (isPrepEnabled) {
        // Prep: timer only. We delay connecting to Realtime until prep reaches 0.
        setPhase("prep");
        phaseRef.current = "prep";
        appendLine({ role: "system", text: "Préparation: 60 secondes (ne pas parler)." });
        startPrepTimer();
        setState("prepping");
      } else {
        // Start immediately.
        connectStartedRef.current = true;
        stopPrepTimer();
        setPrepSecondsLeft(0);
        appendLine({ role: "system", text: "Démarrage immédiat (préparation ignorée)." });
        void connectRealtimeAndStartExam();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
      teardownRealtime();
    }
  }, [
    appendLine,
    teardownRealtime,
    scenario.id,
    scenario.sectionKey,
    scenario.time_limit_sec,
    startPrepTimer,
    startRecording,
    isPrepEnabled,
    stopPrepTimer,
    connectRealtimeAndStartExam,
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
    async (payload: {
      endedAtMs: number;
      endedReason: StopReason;
      finalTranscript: TranscriptLine[];
      finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
    }) => {
      const sid = randomId();
      const sectionParam = scenario.sectionKey.toLowerCase();

      const stored = {
        sessionId: sid,
        createdAt: new Date(payload.endedAtMs),
        endedAt: new Date(payload.endedAtMs),
        endedReason: payload.endedReason,
        sectionKey: scenario.sectionKey,
        scenarioId: scenario.id,
        scenarioPrompt: scenario.prompt,
        timeLimitSec: scenario.time_limit_sec,
        finalTranscript: payload.finalTranscript,
        finalTranscriptForEval: payload.finalTranscriptForEval,
        evaluation: null,
        evaluationStatus: "idle" as const,
        evaluationError: null as string | null,
      };

      // Try to persist to the authenticated results API; fall back to sessionStorage if it fails.
      try {
        const res = await fetch("/api/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stored),
        });
        if (!res.ok) {
          throw new Error(`Failed to save results (${res.status}).`);
        }
      } catch {
        try {
          const key = `tef:results:${sid}`;
          const legacy = {
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
          sessionStorage.setItem(key, JSON.stringify(legacy));
        } catch {
          // ignore – results will simply not be persisted
        }
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
  }, [persistAndNavigateToResults, stopRecording, teardownRealtime]);

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
            `Budget de réponse: ≤${examinerMaxOutputTokens(scenario.sectionKey, "timeout")} tokens. Conclus avant la limite.\n` +
            "Le temps est écoulé. Demande au candidat de conclure en 10–15 secondes. Ensuite, conclus toi-même en 1 phrase et annonce la fin de l’épreuve.",
          max_output_tokens: examinerMaxOutputTokens(scenario.sectionKey, "timeout"),
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

      await persistAndNavigateToResults({
        endedAtMs,
        endedReason,
        finalTranscript,
        finalTranscriptForEval: transcriptForEval,
      });
    }
  }, [
    persistAndNavigateToResults,
    sendEvent,
    stopRecording,
    teardownRealtime,
    scenario.sectionKey,
  ]);

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
    if (phaseRef.current !== "prep") return;
    if (prepSecondsLeft > 0) return;
    if (connectStartedRef.current) return;
    connectStartedRef.current = true;

    stopPrepTimer();
    void connectRealtimeAndStartExam();
  }, [connectRealtimeAndStartExam, prepSecondsLeft, stopPrepTimer]);

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
        debug={showTokenDebug ? rtDebug : undefined}
      />

      <audio ref={remoteAudioRef} autoPlay playsInline />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      {mode === "live" ? (
        <div className="flex items-center justify-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isPrepEnabled}
              disabled={!(state === "idle" || state === "stopped" || state === "error")}
              onChange={(e) => {
                const next = e.target.checked;
                setIsPrepEnabled(next);
                try {
                  localStorage.setItem("tef:prep60s", next ? "1" : "0");
                } catch {
                  // ignore
                }
              }}
            />
            Attendre 60s avant de commencer
          </label>
        </div>
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


