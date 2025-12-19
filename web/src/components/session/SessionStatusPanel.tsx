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
        <div className="text-xs text-zinc-600">
          État:{" "}
          <span className={cn(state === "connected" ? "text-emerald-700" : state === "error" ? "text-red-700" : "")}>
            {state}
          </span>
        </div>
        <div className="text-xs text-zinc-600">
          Phase: <span className="font-medium">{phase}</span>
        </div>
        {showOcr ? (
          <div className="text-xs text-zinc-600">
            OCR:{" "}
            <span className={cn(ocrStatus === "ready" ? "text-emerald-700" : ocrStatus === "error" ? "text-red-700" : "")}>
              {ocrStatus ?? "idle"}
            </span>
          </div>
        ) : null}
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


