"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { EvaluationPanel } from "@/components/session/EvaluationPanel";
import { TranscriptPanel } from "@/components/session/TranscriptPanel";
import type { TranscriptLine } from "@/components/session/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getImageUrl } from "@/lib/kb";

type StoredResults = {
  sessionId: string;
  createdAtMs?: number;
  endedAtMs: number;
  endedReason: "user_stop" | "timeout";
  scenario: { sectionKey: "A" | "B"; id: number; prompt: string; time_limit_sec: number };
  finalTranscript: TranscriptLine[];
  finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
  evaluation?: unknown;
};

export function ResultsClient(props: { sectionParam: string; sid?: string }) {
  const sid = props.sid ?? "";

  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<StoredResults | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);

  const [evalStatus, setEvalStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [evalJson, setEvalJson] = useState<unknown>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setData(null);
    setEvalStatus("idle");
    setEvalJson(null);
    setEvalError(null);

    if (!sid) {
      setLoaded(true);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/results?sessionId=${encodeURIComponent(sid)}`);
        if (res.ok) {
          const json = await res.json();
          const mapped: StoredResults = {
            sessionId: json.sessionId,
            createdAtMs: json.createdAt ? new Date(json.createdAt).getTime() : undefined,
            endedAtMs: new Date(json.endedAt).getTime(),
            endedReason: json.endedReason,
            scenario: {
              sectionKey: json.sectionKey,
              id: json.scenarioId,
              prompt: json.scenarioPrompt,
              time_limit_sec: json.timeLimitSec,
            },
            finalTranscript: json.finalTranscript,
            finalTranscriptForEval: json.finalTranscriptForEval,
            evaluation: json.evaluation,
          };
          setData(mapped);
          if (json.evaluation) {
            setEvalJson(json.evaluation);
            setEvalStatus("done");
          }
        } else if (res.status === 401 || res.status === 404) {
          // Fallback to legacy sessionStorage (pre-auth sessions or unauthenticated use)
          try {
            const storageKey = `tef:results:${sid}`;
            const raw = sessionStorage.getItem(storageKey);
            if (raw) {
              const legacy = JSON.parse(raw) as {
                version: 1;
                endedAtMs: number;
                endedReason: "user_stop" | "timeout";
                scenario: { sectionKey: "A" | "B"; id: number; prompt: string; time_limit_sec: number };
                finalTranscript: TranscriptLine[];
                finalTranscriptForEval: Array<{ role: "user" | "assistant"; text: string }>;
                evaluation?: unknown;
              };
              if (legacy && legacy.version === 1) {
                const mapped: StoredResults = {
                  sessionId: sid,
                  createdAtMs: legacy.endedAtMs,
                  endedAtMs: legacy.endedAtMs,
                  endedReason: legacy.endedReason,
                  scenario: legacy.scenario,
                  finalTranscript: legacy.finalTranscript,
                  finalTranscriptForEval: legacy.finalTranscriptForEval,
                  evaluation: legacy.evaluation,
                };
                setData(mapped);
                if (legacy.evaluation) {
                  setEvalJson(legacy.evaluation);
                  setEvalStatus("done");
                }
              }
            }
          } catch {
            // ignore
          }
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [sid]);

  const canEvaluate = Boolean(data?.finalTranscriptForEval?.some((l) => l.role === "user" && l.text.trim()));

  const endedLabel = useMemo(() => {
    if (!data) return "";
    return data.endedReason === "timeout" ? "Temps écoulé" : "Évaluation demandée";
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (!canEvaluate) return;
    if (evalStatus !== "idle") return;

    (async () => {
      setEvalStatus("loading");
      setEvalError(null);
      try {
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario: data.scenario,
            transcript: data.finalTranscriptForEval,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Evaluation failed (${res.status}): ${text}`);
        }
        const json = await res.json();
        setEvalJson(json);
        setEvalStatus("done");

        // Persist evaluation back to Mongo so history/results views don't re-run it.
        try {
          await fetch("/api/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: data.sessionId,
              createdAt: new Date(data.createdAtMs ?? data.endedAtMs).toISOString(),
              endedAt: new Date(data.endedAtMs).toISOString(),
              endedReason: data.endedReason,
              sectionKey: data.scenario.sectionKey,
              scenarioId: data.scenario.id,
              scenarioPrompt: data.scenario.prompt,
              timeLimitSec: data.scenario.time_limit_sec,
              finalTranscript: data.finalTranscript,
              finalTranscriptForEval: data.finalTranscriptForEval,
              evaluation: json,
              evaluationStatus: "done",
              evaluationError: null,
            }),
          });
        } catch {
          // ignore persistence errors; evaluation is still shown in the UI
        }
      } catch (e) {
        setEvalStatus("error");
        setEvalError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [canEvaluate, data, evalStatus]);

  return (
    <main className="mx-auto min-h-dvh max-w-4xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/session/${props.sectionParam}`}>Nouvelle tâche</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Accueil</Link>
          </Button>
        </div>
        <ModeToggle />
      </div>

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Résultats</CardTitle>
            {data ? (
              <div className="text-sm text-muted-foreground">
                {endedLabel} · {new Date(data.endedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : loaded ? (
              <div className="text-sm text-muted-foreground">Aucune donnée de session trouvée.</div>
            ) : (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            )}
          </CardHeader>
          {data ? (
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative h-28 w-full overflow-hidden rounded-md border bg-muted sm:h-24 sm:w-40">
                  <Image
                    src={getImageUrl(data.scenario.sectionKey, data.scenario.id)}
                    alt={`Image scénario ${data.scenario.id}`}
                    fill
                    sizes="(min-width: 640px) 160px, 100vw"
                    className="object-contain"
                  />
                </div>
                <div className="text-sm text-muted-foreground overflow-hidden [display:-webkit-box] [-webkit-line-clamp:5] [-webkit-box-orient:vertical]">
                  {data.scenario.prompt}
                </div>
              </div>
            </CardContent>
          ) : null}
        </Card>

        {!canEvaluate && loaded ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Impossible d’évaluer: aucune transcription candidat n’a été capturée.
          </div>
        ) : null}

        <EvaluationPanel status={evalStatus} evaluation={evalJson} error={evalError} />

        {data ? (
          <TranscriptPanel
            transcript={data.finalTranscript}
            open={isTranscriptOpen}
            onToggleOpen={setIsTranscriptOpen}
          />
        ) : null}
      </div>
    </main>
  );
}


