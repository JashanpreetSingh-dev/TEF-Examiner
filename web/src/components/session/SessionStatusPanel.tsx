import { Badge } from "@/components/ui/badge";
import { cn, formatTimeMMSS } from "@/lib/utils";
import type { ConnState, Phase } from "./types";

export function SessionStatusPanel(props: {
  state: ConnState;
  phase: Phase;
  secondsLeft: number;
  prepSecondsLeft: number;
  ocrStatus?: "idle" | "loading" | "ready" | "error";
  showOcr?: boolean;
}) {
  const { state, phase, secondsLeft, prepSecondsLeft, showOcr, ocrStatus } = props;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">Session</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={state === "error" ? "destructive" : state === "connected" ? "secondary" : "outline"}>
            {state}
          </Badge>
          <Badge variant="outline">{phase}</Badge>
          {showOcr ? (
            <Badge
              variant={ocrStatus === "error" ? "destructive" : ocrStatus === "ready" ? "secondary" : "outline"}
              className={cn(ocrStatus === "loading" ? "animate-pulse" : "")}
            >
              OCR: {ocrStatus ?? "idle"}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border bg-zinc-50 px-3 py-1.5 text-sm font-medium tabular-nums">
        {phase === "prep" ? (
          <span>Prep: {formatTimeMMSS(prepSecondsLeft)}</span>
        ) : (
          <span>Temps: {formatTimeMMSS(secondsLeft)}</span>
        )}
      </div>
    </div>
  );
}


