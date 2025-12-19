import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Criterion = { name: string; score_0_10: number; comment?: string; improvements?: string[] };
type UpgradedSentence = { weak?: string; better: string; why?: string };

function isRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object";
}

export function EvaluationPanel(props: {
  status: "idle" | "loading" | "done" | "error";
  evaluation?: unknown;
  error?: string | null;
}) {
  if (props.status === "idle") {
    return (
      <Panel title="Évaluation">
        <div className="text-sm text-muted-foreground">Cliquez sur “Évaluer” pour lancer l’analyse.</div>
      </Panel>
    );
  }

  if (props.status === "loading") {
    return (
      <Panel title="Évaluation">
        <div className="space-y-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </Panel>
    );
  }

  if (props.status === "error") {
    return (
      <Panel title="Évaluation">
        {props.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{props.error}</div>
        ) : (
          <div className="text-sm text-muted-foreground">Erreur inconnue.</div>
        )}
      </Panel>
    );
  }

  const evalObj = isRecord(props.evaluation) ? props.evaluation : null;
  const result = evalObj && isRecord(evalObj.result) ? evalObj.result : null;

  if (!result) {
    return (
      <Panel title="Évaluation">
        <pre className="max-h-80 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(props.evaluation, null, 2)}</pre>
      </Panel>
    );
  }

  if ("raw" in result && result.raw) {
    return (
      <Panel title="Évaluation">
        <div className="rounded bg-zinc-50 p-3 text-xs whitespace-pre-wrap">{String(result.raw)}</div>
      </Panel>
    );
  }

  const criteria = normalizeCriteria(result.criteria);
  const strengths = normalizeStringList(result.strengths);
  const topImprovements = normalizeStringList(result.top_improvements);
  const upgraded = normalizeUpgraded(result.upgraded_sentences);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Évaluation</CardTitle>
          <div className="flex items-center gap-2">
            {evalObj && isRecord(evalObj.metrics) && evalObj.metrics.eo1_question_count != null ? (
              <Badge variant="outline">
                Questions: {String(evalObj.metrics.eo1_question_count)}
                {evalObj.metrics.eo1_question_target ? `/${String(evalObj.metrics.eo1_question_target)}` : ""}
              </Badge>
            ) : null}
            {"cecr_level" in result && result.cecr_level ? <Badge variant="secondary">CECR: {String(result.cecr_level)}</Badge> : null}
            {"clb_equivalence" in result && result.clb_equivalence ? <Badge variant="secondary">CLB: {String(result.clb_equivalence)}</Badge> : null}
            <Badge variant="secondary">{evalObj?.model ? String(evalObj.model) : "?"}</Badge>
            <Badge variant="outline">{
              "overall_band_estimate" in result && result.overall_band_estimate != null ? String(result.overall_band_estimate) : "—"
            }</Badge>
          </div>
        </div>
        {"overall_comment" in result && result.overall_comment ? (
          <div className="text-sm text-muted-foreground">{String(result.overall_comment)}</div>
        ) : null}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="summary">Résumé</TabsTrigger>
            <TabsTrigger value="criteria">Critères</TabsTrigger>
            <TabsTrigger value="sentences">Phrases</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs font-medium text-muted-foreground">Forces</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {strengths.length ? strengths.map((x: string) => <li key={x}>{x}</li>) : <li>—</li>}
                </ul>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs font-medium text-muted-foreground">Top améliorations</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {topImprovements.length ? topImprovements.map((x: string) => <li key={x}>{x}</li>) : <li>—</li>}
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="criteria" className="space-y-3">
            {criteria.length ? (
              criteria.map((c) => (
                <div key={c.name} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{c.name}</div>
                    <Badge variant="secondary">{c.score_0_10}/10</Badge>
                  </div>
                  {c.comment ? <div className="mt-2 text-sm text-muted-foreground">{c.comment}</div> : null}
                  {Array.isArray(c.improvements) && c.improvements.length ? (
                    <>
                      <Separator className="my-3" />
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {c.improvements.map((x: string) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </TabsContent>

          <TabsContent value="sentences" className="space-y-2">
            {upgraded.length ? (
              upgraded.map((u, idx: number) => (
                <div key={idx} className="rounded-lg border bg-muted/30 p-3 text-sm">
                  {u.weak ? (
                    <>
                      <div className="text-xs font-medium text-muted-foreground">Avant</div>
                      <div className="mt-1">{u.weak}</div>
                      <div className="mt-3 text-xs font-medium text-muted-foreground">Mieux</div>
                    </>
                  ) : (
                    <div className="text-xs font-medium text-muted-foreground">Suggestion</div>
                  )}
                  <div className="mt-1 font-medium">{u.better ?? ""}</div>
                  {u.why ? <div className="mt-2 text-xs text-muted-foreground">Pourquoi: {u.why}</div> : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Panel(props: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="space-y-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{props.title}</CardTitle>
          {props.right}
        </div>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function normalizeStringList(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return [];
    return [s];
  }
  return [];
}

function normalizeCriteria(val: unknown): Criterion[] {
  if (Array.isArray(val)) {
    return val
      .filter((x): x is Record<string, unknown> => isRecord(x) && typeof x.name === "string")
      .map((x) => {
        const scoreRaw = typeof x.score_0_10 === "number" ? x.score_0_10 : typeof x.score === "number" ? x.score : 0;
        const improvementsRaw = x.improvements;
        const improvements = Array.isArray(improvementsRaw)
          ? improvementsRaw.filter((i): i is string => typeof i === "string")
          : undefined;
        return {
          name: x.name,
          score_0_10: Number.isFinite(scoreRaw) ? scoreRaw : 0,
          comment: typeof x.comment === "string" ? x.comment : undefined,
          improvements,
        };
      });
  }

  if (val && typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    return entries
      .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
      .map(([k, v]) => ({
        name: humanizeCriterionKey(k),
        score_0_10: v,
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

function normalizeUpgraded(val: unknown): UpgradedSentence[] {
  if (Array.isArray(val)) {
    const objs = val.filter((x): x is Record<string, unknown> => isRecord(x) && typeof x.better === "string");
    if (objs.length) {
      return objs.map((u) => ({
        weak: typeof u.weak === "string" ? u.weak : undefined,
        better: String(u.better),
        why: typeof u.why === "string" ? u.why : undefined,
      }));
    }
    const strs = val.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
    return strs.map((s) => ({ better: s }));
  }
  return [];
}


