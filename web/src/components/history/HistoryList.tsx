import { HistoryCard } from "@/components/history/HistoryCard";
import type { ExamResultDocument } from "@/lib/models/ExamResult";

type HistoryItem = Pick<
  ExamResultDocument,
  "sessionId" | "sectionKey" | "scenarioId" | "scenarioPrompt" | "endedAt" | "endedReason" | "evaluation"
>;

type EvaluationWithBand = {
  result?: {
    overall_band_estimate?: string;
  };
};

export function HistoryList(props: { results: HistoryItem[] }) {
  if (!props.results.length) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        Aucun historique pour le moment. Lancez une simulation pour voir vos résultats ici.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {props.results.map((r) => (
        <HistoryCard
          key={r.sessionId}
          result={{
            sessionId: r.sessionId,
            sectionKey: r.sectionKey,
            scenarioId: r.scenarioId,
            scenarioPrompt: r.scenarioPrompt,
            endedAt: r.endedAt,
            endedReason: r.endedReason,
            overallBandEstimate:
              r.evaluation && typeof r.evaluation === "object" && "result" in r.evaluation
                ? (r.evaluation as EvaluationWithBand).result?.overall_band_estimate
                : undefined,
          }}
        />
      ))}
    </div>
  );
}


