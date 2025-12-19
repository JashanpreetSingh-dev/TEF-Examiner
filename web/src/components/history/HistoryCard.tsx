import type { ExamResultDocument } from "@/lib/models/ExamResult";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { getImageUrl } from "@/lib/kb";

type Props = {
  result: Pick<
    ExamResultDocument,
    "sessionId" | "sectionKey" | "scenarioId" | "scenarioPrompt" | "endedAt" | "endedReason"
  > & { overallBandEstimate?: string };
};

export function HistoryCard({ result }: Props) {
  const endedAt = new Date(result.endedAt);
  const label = result.endedReason === "timeout" ? "Temps écoulé" : "Évaluation demandée";
  const imageUrl = getImageUrl(result.sectionKey, result.scenarioId);

  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            Section {result.sectionKey} ·{" "}
            <span className="font-normal text-sm text-muted-foreground">
              {endedAt.toLocaleDateString()} ·{" "}
              {endedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </CardTitle>
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 items-start">
          <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-md border bg-muted">
            <Image
              src={imageUrl}
              alt={`Image scénario ${result.scenarioId}`}
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
          <p className="text-sm text-muted-foreground overflow-hidden [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical]">
            {result.scenarioPrompt}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{result.overallBandEstimate ? `Niveau estimé: ${result.overallBandEstimate}` : "En attente d’évaluation"}</span>
          <Link
            href={`/session/${result.sectionKey.toLowerCase()}/results?sid=${encodeURIComponent(result.sessionId)}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Voir le détail
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

