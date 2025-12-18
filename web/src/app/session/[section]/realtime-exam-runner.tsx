"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Scenario } from "@/lib/kb";
import { cn, formatTimeMMSS } from "@/lib/utils";

type ConnState = "idle" | "requesting_mic" | "fetching_token" | "connecting" | "connected" | "stopping" | "stopped" | "error";

type TranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

function makeExamInstructions(scenario: Scenario) {
  const base = [
    "Tu es un examinateur TEF Canada (Expression Orale).",
    "Tu dois simuler l’épreuve de manière réaliste et dynamique.",
    "Tu parles uniquement en français.",
    "Objectif: faire parler le candidat, relancer, demander des précisions, reformuler si nécessaire.",
    "Style: naturel, professionnel, mais pas robotique.",
    "Ne donne pas les réponses au candidat. Ne corrige pas en continu pendant l’épreuve (garde les corrections pour la fin si demandé).",
  ];

  if (scenario.sectionKey === "A") {
    return [
      ...base,
      "Épreuve EO1: interaction type appel téléphonique.",
      "Le candidat appelle pour obtenir des informations; tu joues l’interlocuteur (standard, vendeur, organisateur, etc.).",
      "Pose des questions de clarification, propose des informations progressivement, et encourage le candidat à poser des questions.",
      `Consigne: ${scenario.prompt}`,
      `Liste de questions suggérées (à couvrir si possible): ${scenario.suggested_questions.join(" ; ")}`,
    ].join("\n");
  }

  return [
    ...base,
    "Épreuve EO2: argumentation / persuasion.",
    "Le candidat doit convaincre un(e) ami(e). Tu joues l’ami(e) sceptique et tu utilises des contre-arguments progressivement.",
    "Exige des justifications, exemples, et concessions. Relance si c’est trop court.",
    `Consigne: ${scenario.prompt}`,
    `Contre-arguments possibles (à utiliser graduellement): ${scenario.counter_arguments.join(" | ")}`,
  ].join("\n");
}

function randomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function RealtimeExamRunner(props: { scenario: Scenario; imageUrl: string }) {
  const { scenario } = props;

  const [state, setState] = useState<ConnState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(scenario.time_limit_sec);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const timeoutHandledRef = useRef(false);
  const evaluationTriggeredRef = useRef(false);

  const instructions = useMemo(() => makeExamInstructions(scenario), [scenario]);

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

  const startTimer = useCallback(() => {
    stopTimer();
    setSecondsLeft(scenario.time_limit_sec);
    timeoutHandledRef.current = false;
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
  }, [scenario.time_limit_sec, stopTimer]);

  const cleanup = useCallback(() => {
    stopTimer();

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

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setEvaluation(null);
    evaluationTriggeredRef.current = false;
    setSecondsLeft(scenario.time_limit_sec);

    try {
      setState("requesting_mic");
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;

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
            if (typeof transcriptText === "string") upsertUserText(transcriptText);
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

      // Start the examiner
      sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            scenario.sectionKey === "A"
              ? "Commence l’épreuve EO1 maintenant. Salue brièvement puis lance la conversation. Pose une première question."
              : "Commence l’épreuve EO2 maintenant. Lance la discussion avec un ton d’ami(e) sceptique puis invite le candidat à te convaincre.",
        },
      });

      startTimer();
      appendLine({ role: "system", text: "Connexion établie. L’épreuve commence." });
      setState("connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
      cleanup();
    }
  }, [appendLine, cleanup, instructions, scenario.sectionKey, scenario.time_limit_sec, sendEvent, startTimer, upsertAssistantDelta, upsertUserText]);

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
    setTranscript([]);
    setError(null);
    setEvaluation(null);
    evaluationTriggeredRef.current = false;
    setState("idle");
    cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id]);

  useEffect(() => {
    if (state !== "connected") return;
    if (secondsLeft > 0) return;
    void handleTimeout();
  }, [secondsLeft, state, handleTimeout]);

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
        </div>
        <div className="rounded-lg border bg-zinc-50 px-3 py-1.5 text-sm font-medium tabular-nums">
          {formatTimeMMSS(secondsLeft)}
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

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-white p-3">
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

  const criteria = Array.isArray(result.criteria) ? result.criteria : [];
  const strengths = Array.isArray(result.strengths) ? result.strengths : [];
  const topImprovements = Array.isArray(result.top_improvements) ? result.top_improvements : [];
  const upgraded = Array.isArray(result.upgraded_sentences) ? result.upgraded_sentences : [];

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Évaluation</div>
        <div className="text-xs text-zinc-500">Modèle: {props.evaluation?.model ?? "?"}</div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-zinc-50 p-3">
          <div className="text-xs font-medium text-zinc-500">Estimation globale</div>
          <div className="mt-1 text-lg font-semibold">{result.overall_band_estimate ?? "—"}</div>
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
                <div className="text-zinc-500">Avant</div>
                <div className="text-zinc-900">{u.weak ?? ""}</div>
                <div className="mt-2 text-zinc-500">Mieux</div>
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


