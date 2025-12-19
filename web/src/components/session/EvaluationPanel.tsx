import type { ReactNode } from "react";

export function EvaluationPanel(props: { evaluation: any }) {
  const result = props.evaluation?.result;

  if (!result) {
    return (
      <Panel title="Évaluation">
        <pre className="max-h-80 overflow-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(props.evaluation, null, 2)}</pre>
      </Panel>
    );
  }

  if (result.raw) {
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
    <Panel
      title="Évaluation"
      right={<div className="text-xs text-zinc-500">Modèle: {props.evaluation?.model ?? "?"}</div>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
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
    </Panel>
  );
}

function Panel(props: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{props.title}</div>
        {props.right}
      </div>
      <div className="mt-2">{props.children}</div>
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
    const objs = val.filter((x) => x && typeof x === "object" && typeof (x as any).better === "string");
    if (objs.length) {
      return objs.map((u: any) => ({
        weak: typeof u.weak === "string" ? u.weak : undefined,
        better: u.better,
        why: typeof u.why === "string" ? u.why : undefined,
      }));
    }
    const strs = val.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
    return strs.map((s) => ({ better: s }));
  }
  return [];
}


