"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Scenario } from "@/lib/kb";
import { cn, formatTimeMMSS } from "@/lib/utils";

type ConnState =
  | "idle"
  | "requesting_mic"
  | "fetching_token"
  | "connecting"
  | "connected"
  | "stopping"
  | "stopped"
  | "error";

type Phase = "none" | "prebrief" | "prep" | "exam";

type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

function makeExamInstructions(scenario: Scenario, ocr: null | { raw_text: string; facts: Array<{ key: string; value: string }> }) {
  const base = [
    "Tu es un examinateur TEF Canada (Expression Orale).",
    "Tu dois simuler l’épreuve de manière réaliste et dynamique.",
    "Tu parles uniquement en français.",
    "Objectif: simuler une interaction réaliste selon la tâche; rester naturel.",
    "Style: naturel, professionnel, mais pas robotique.",
    "IMPORTANT: ne corrige pas le candidat pendant l’épreuve. Pas de conseils pédagogiques, pas d’explications de grammaire. Pas de coaching.",
  ];

  if (scenario.sectionKey === "A") {
    const facts = (ocr?.facts ?? []).map((f) => `- ${f.key}: ${f.value}`).join("\n");
    return [
      ...base,
      "Épreuve EO1: interaction type appel téléphonique.",
      "Tu joues l’interlocuteur (standard, vendeur, organisateur, etc.).",
      "Le candidat pilote l’appel en posant des questions. Tu réponds uniquement à ce qui est demandé.",
      "Tu ne suggères PAS quelles questions poser. Tu ne listes pas d’informations spontanément.",
      "Tu peux poser une question de clarification uniquement si la demande est ambiguë ou incompréhensible.",
      "Réponses: concises, polies, ton téléphone. Donne les détails progressivement, seulement quand on te les demande.",
      "Priorité d'information: utilise d'abord les informations de l'annonce (OCR) ci-dessous si elles existent.",
      "Si un détail n'apparaît pas dans l'annonce, invente une information plausible (ex: prix, horaires, modalités) et présente-la comme un fait.",
      "IMPORTANT: si tu inventes un détail, reste cohérent ensuite (même prix, mêmes horaires, même adresse) pendant tout l'appel.",
      `Consigne: ${scenario.prompt}`,
      "Informations de l'annonce (OCR):",
      facts || "- (aucune information extraite)",
    ].join("\n");
  }

  return [
    ...base,
    "Épreuve EO2: argumentation / persuasion.",
    "Le candidat doit convaincre un(e) ami(e). Tu joues l’ami(e) sceptique.",
    "Tu utilises des contre-arguments progressivement (pas tous à la fois) et tu demandes des justifications/exemples.",
    "CONTRAINTE ABSOLUE: tu dois utiliser UNIQUEMENT les contre-arguments ci-dessous (tu peux paraphraser), et tu ne dois PAS inventer de nouvelles objections.",
    "Choisis le prochain contre-argument en fonction de ce que le candidat vient de dire.",
    "Ne débute pas par des contre-arguments avant que le candidat ait commencé à parler (le candidat parle en premier).",
    `Consigne: ${scenario.prompt}`,
    `Contre-arguments possibles (à utiliser graduellement): ${scenario.counter_arguments.join(" | ")}`,
  ].join("\n");
}

function makePrebrief(scenario: Scenario) {
  if (scenario.sectionKey === "A") {
    return [
      "Vous allez faire l’épreuve d’expression orale, section A (EO1).",
      "Vous allez voir une image et une consigne.",
      "Je vais vous laisser 60 secondes pour lire et vous préparer. Pendant ce temps, ne parlez pas.",
      "Ensuite, je commencerai l’appel téléphonique et vous poserez vos questions.",
    ].join(" ");
  }

  return [
    "Vous allez faire l’épreuve d’expression orale, section B (EO2).",
    "Vous allez voir une image et une consigne.",
    "Je vais vous laisser 60 secondes pour lire et vous préparer. Pendant ce temps, ne parlez pas.",
    "Ensuite, vous commencerez à parler en premier pour essayer de me convaincre.",
  ].join(" ");
}

function randomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function RealtimeExamRunner(props: { scenario: Scenario; imageUrl: string }) {
  const { scenario } = props;

  const [state, setState] = useState<ConnState>("idle");
  const [phase, setPhase] = useState<Phase>("none");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(scenario.time_limit_sec);
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number>(60);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const prepTimerRef = useRef<number | null>(null);
  const timeoutHandledRef = useRef(false);
  const evaluationTriggeredRef = useRef(false);
  const phaseRef = useRef<Phase>("none");
  const examStartedRef = useRef(false);
  const awaitingResponseRef = useRef(false);
  const warn60SentRef = useRef(false);
  const warn10SentRef = useRef(false);

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

  const cleanup = useCallback(() => {
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
      remoteAudioRef.current.srcObject = null;
    }
  }, [stopTimer]);

  const sendEvent = useCallback((evt: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(evt));
  }, []);

  const maybeRequestModelResponse = useCallback(
    (reason: "start_eo1" | "user_turn" | "warning_60" | "warning_10") => {
      if (phaseRef.current !== "exam") return;
      const isWarning = reason === "warning_60" || reason === "warning_10";
      if (!isWarning) {
        if (awaitingResponseRef.current) return;
        awaitingResponseRef.current = true;
      }

      const common = {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
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

      sendEvent({
        ...common,
        response: {
          ...(common as any).response,
          instructions: instructionForReason,
        },
      });
    },
    [scenario.sectionKey, sendEvent],
  );

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setEvaluation(null);
    evaluationTriggeredRef.current = false;
    examStartedRef.current = false;
    awaitingResponseRef.current = false;
    setPhase("none");
    phaseRef.current = "none";
    setSecondsLeft(scenario.time_limit_sec);
    setPrepSecondsLeft(60);

    try {
      setState("requesting_mic");
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;

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
          } else if (type === "conversation.item.input_audio_transcription.completed") {
            const transcriptText =
              (evt.transcript as string | undefined) ??
              ((evt.item as any)?.content?.[0]?.transcript as string | undefined);
            if (typeof transcriptText === "string" && phaseRef.current === "exam") {
              upsertUserText(transcriptText);
              // For EO2, candidate speaks first; for both sections, respond after a candidate turn.
              if (!examStartedRef.current) {
                examStartedRef.current = true;
              }
              maybeRequestModelResponse("user_turn");
            }
          } else if (type === "response.completed" || type === "response.done" || type === "response.finished") {
            awaitingResponseRef.current = false;
          } else if (type === "error") {
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
          // If supported, ask the server to transcribe user input audio too.
          input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
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
      cleanup();
    }
  }, [
    appendLine,
    cleanup,
    maybeRequestModelResponse,
    prebrief,
    ocrData,
    scenario.id,
    scenario.sectionKey,
    scenario.time_limit_sec,
    sendEvent,
    startPrepTimer,
    upsertAssistantDelta,
    upsertUserText,
  ]);

  const evaluateNow = useCallback(async () => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const payload = {
        scenario: {
          sectionKey: scenario.sectionKey,
          id: scenario.id,
          prompt: scenario.prompt,
          time_limit_sec: scenario.time_limit_sec,
        },
        transcript: transcript.map((t) => ({ role: t.role, text: t.text })),
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
      setEvaluation(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsEvaluating(false);
    }
  }, [isEvaluating, scenario.id, scenario.prompt, scenario.sectionKey, scenario.time_limit_sec, transcript]);

  const stop = useCallback(async () => {
    setState("stopping");
    try {
      // Best-effort: ask the model to wrap up quickly before we close.
      sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "Merci. Conclus en 1-2 phrases maximum et dis clairement que l’épreuve est terminée. Pas d’analyse, pas de feedback.",
        },
      });

      await new Promise((r) => setTimeout(r, 600));
    } finally {
      cleanup();
      setState("stopped");
      if (!evaluationTriggeredRef.current) {
        evaluationTriggeredRef.current = true;
        void evaluateNow();
      }
    }
  }, [cleanup, evaluateNow, sendEvent]);

  const handleTimeout = useCallback(async () => {
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    setState("stopping");

    try {
      // Ask for a short wrap-up (10–15 seconds), then close the connection.
      sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "Le temps est écoulé. Demande au candidat de conclure en 10–15 secondes. Ensuite, conclus toi-même en 1 phrase et annonce la fin de l’épreuve.",
        },
      });
      await new Promise((r) => setTimeout(r, 12000));
    } finally {
      cleanup();
      setState("stopped");
      if (!evaluationTriggeredRef.current) {
        evaluationTriggeredRef.current = true;
        void evaluateNow();
      }
    }
  }, [cleanup, evaluateNow, sendEvent]);

  useEffect(() => {
    // Reset timer if user navigates to another scenario
    setSecondsLeft(scenario.time_limit_sec);
    setPrepSecondsLeft(60);
    setTranscript([]);
    setError(null);
    setEvaluation(null);
    evaluationTriggeredRef.current = false;
    examStartedRef.current = false;
    awaitingResponseRef.current = false;
    setPhase("none");
    phaseRef.current = "none";
    setState("idle");
    cleanup();
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

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">Session Realtime</div>
          <div className="text-xs text-zinc-600">
            État:{" "}
            <span className={cn(state === "connected" ? "text-emerald-700" : state === "error" ? "text-red-700" : "")}>
              {state}
            </span>
          </div>
          <div className="text-xs text-zinc-600">
            Phase: <span className="font-medium">{phase}</span>
          </div>
          {scenario.sectionKey === "A" ? (
            <div className="text-xs text-zinc-600">
              OCR:{" "}
              <span
                className={cn(
                  ocrStatus === "ready" ? "text-emerald-700" : ocrStatus === "error" ? "text-red-700" : "",
                )}
              >
                {ocrStatus}
              </span>
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border bg-zinc-50 px-3 py-1.5 text-sm font-medium tabular-nums">
          {phase === "prep" ? (
            <span>
              Prep: {formatTimeMMSS(prepSecondsLeft)}
            </span>
          ) : (
            <span>
              Temps: {formatTimeMMSS(secondsLeft)}
            </span>
          )}
        </div>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={start}
          disabled={state !== "idle" && state !== "stopped" && state !== "error"}
        >
          Démarrer
        </button>
        <button
          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={stop}
          disabled={state !== "connected"}
        >
          Arrêter
        </button>
        <button
          className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={evaluateNow}
          disabled={isEvaluating || (state !== "stopped" && state !== "error")}
        >
          {isEvaluating ? "Évaluation..." : "Évaluer"}
        </button>
      </div>

      <details
        className="rounded-lg border bg-white"
        open={isTranscriptOpen}
        onToggle={(e) => setIsTranscriptOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
          Transcript{" "}
          <span className="text-xs font-normal text-zinc-500">
            ({transcript.length ? `${transcript.length} lignes` : "vide"})
          </span>
        </summary>
        <div className="min-h-0 max-h-80 overflow-auto border-t p-3">
          {transcript.length === 0 ? (
            <div className="text-sm text-zinc-500">
              Cliquez <span className="font-medium">Démarrer</span>, autorisez le micro, puis parlez normalement.
            </div>
          ) : (
            <div className="space-y-3">
              {transcript.map((line) => (
                <div key={line.id} className="text-sm">
                  <div className="text-xs font-medium text-zinc-500">
                    {line.role === "assistant" ? "Examinateur" : line.role === "user" ? "Candidat" : "Système"}
                  </div>
                  <div className="whitespace-pre-wrap text-zinc-900">{line.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {evaluation ? <EvaluationPanel evaluation={evaluation} /> : null}
    </div>
  );
}

function EvaluationPanel(props: { evaluation: any }) {
  const result = props.evaluation?.result;

  if (!result) {
    return (
      <div className="rounded-lg border bg-white p-3">
        <div className="text-sm font-medium">Évaluation</div>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-zinc-50 p-3 text-xs">
          {JSON.stringify(props.evaluation, null, 2)}
        </pre>
      </div>
    );
  }

  if (result.raw) {
    return (
      <div className="rounded-lg border bg-white p-3">
        <div className="text-sm font-medium">Évaluation</div>
        <div className="mt-2 rounded bg-zinc-50 p-3 text-xs whitespace-pre-wrap">{String(result.raw)}</div>
      </div>
    );
  }

  const criteria = normalizeCriteria(result.criteria);
  const strengths = normalizeStringList(result.strengths);
  const topImprovements = normalizeStringList(result.top_improvements);
  const upgraded = normalizeUpgraded(result.upgraded_sentences);

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Évaluation</div>
        <div className="text-xs text-zinc-500">Modèle: {props.evaluation?.model ?? "?"}</div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-zinc-50 p-3">
          <div className="text-xs font-medium text-zinc-500">Estimation globale</div>
          <div className="mt-1 text-lg font-semibold">{String(result.overall_band_estimate ?? "—")}</div>
          <div className="mt-2 text-sm text-zinc-800">{result.overall_comment ?? ""}</div>
        </div>

        <div className="rounded-lg border bg-zinc-50 p-3">
          <div className="text-xs font-medium text-zinc-500">Top améliorations</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
            {topImprovements.length ? topImprovements.map((x: string) => <li key={x}>{x}</li>) : <li>—</li>}
          </ul>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs font-medium text-zinc-500">Forces</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
            {strengths.length ? strengths.map((x: string) => <li key={x}>{x}</li>) : <li>—</li>}
          </ul>
        </div>

        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs font-medium text-zinc-500">Critères</div>
          <div className="mt-2 space-y-2">
            {criteria.length ? (
              criteria.map((c: any) => (
                <div key={c.name} className="rounded border bg-zinc-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-sm font-semibold tabular-nums">{c.score_0_10}/10</div>
                  </div>
                  {c.comment ? <div className="mt-1 text-sm text-zinc-800">{c.comment}</div> : null}
                  {Array.isArray(c.improvements) && c.improvements.length ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
                      {c.improvements.map((x: string) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-zinc-600">—</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border bg-white p-3">
        <div className="text-xs font-medium text-zinc-500">Phrases améliorées</div>
        <div className="mt-2 space-y-2">
          {upgraded.length ? (
            upgraded.map((u: any, idx: number) => (
              <div key={idx} className="rounded border bg-zinc-50 p-2 text-sm">
                {u.weak ? (
                  <>
                    <div className="text-zinc-500">Avant</div>
                    <div className="text-zinc-900">{u.weak}</div>
                    <div className="mt-2 text-zinc-500">Mieux</div>
                  </>
                ) : (
                  <div className="text-zinc-500">Suggestion</div>
                )}
                <div className="text-zinc-900">{u.better ?? ""}</div>
                {u.why ? <div className="mt-2 text-zinc-700">Pourquoi: {u.why}</div> : null}
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-600">—</div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeStringList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return [];
    // If the model returned a paragraph, keep it as one bullet.
    return [s];
  }
  return [];
}

function normalizeCriteria(val: unknown): Array<{ name: string; score_0_10: number; comment?: string; improvements?: string[] }> {
  if (Array.isArray(val)) {
    return val
      .filter((x) => x && typeof x === "object" && typeof (x as any).name === "string")
      .map((x: any) => ({
        name: x.name,
        score_0_10: Number.isFinite(x.score_0_10) ? x.score_0_10 : Number.isFinite(x.score) ? x.score : 0,
        comment: typeof x.comment === "string" ? x.comment : undefined,
        improvements: Array.isArray(x.improvements) ? x.improvements.filter((i: any) => typeof i === "string") : undefined,
      }));
  }

  // Support object form: { task_fulfillment: 7, ... }
  if (val && typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    return entries
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
      .map(([k, v]) => ({
        name: humanizeCriterionKey(k),
        score_0_10: v as number,
      }));
  }

  return [];
}

function humanizeCriterionKey(k: string) {
  const map: Record<string, string> = {
    task_fulfillment: "Task fulfillment / pertinence",
    coherence_organization: "Coherence & organization",
    lexical_range_appropriateness: "Lexical range & appropriateness",
    grammar_control: "Grammar control",
    fluency_pronunciation: "Fluency & pronunciation",
    interaction: "Interaction",
  };
  return map[k] ?? k.replace(/_/g, " ");
}

function normalizeUpgraded(val: unknown): Array<{ weak?: string; better: string; why?: string }> {
  if (Array.isArray(val)) {
    // Already structured objects?
    const objs = val.filter((x) => x && typeof x === "object" && typeof (x as any).better === "string");
    if (objs.length) {
      return objs.map((u: any) => ({
        weak: typeof u.weak === "string" ? u.weak : undefined,
        better: u.better,
        why: typeof u.why === "string" ? u.why : undefined,
      }));
    }
    // Otherwise it's probably an array of strings (suggested sentences)
    const strs = val.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
    return strs.map((s) => ({ better: s }));
  }
  return [];
}


