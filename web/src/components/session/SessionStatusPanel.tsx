import { Badge } from "@/components/ui/badge";
import { cn, formatTimeMMSS } from "@/lib/utils";
import type { ConnState, Phase } from "./types";

export function SessionStatusPanel(props: {
  mode?: "live" | "results";
  state: ConnState;
  phase: Phase;
  secondsLeft: number;
  prepSecondsLeft: number;
  endedAtMs?: number;
  endedReason?: "user_stop" | "timeout";
  ocrStatus?: "idle" | "loading" | "ready" | "error";
  showOcr?: boolean;
}) {
  const { mode = "live", state, phase, secondsLeft, prepSecondsLeft, endedAtMs, endedReason, showOcr, ocrStatus } = props;

  const endedLabel =
    endedReason === "timeout" ? "Temps écoulé" : endedReason === "user_stop" ? "Arrêté" : undefined;

  const tone =
    state === "connected"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : state === "error"
        ? "border-red-500/30 bg-red-500/5"
        : state === "requesting_mic"
          ? "border-amber-500/30 bg-amber-500/5"
          : state === "fetching_token" || state === "connecting"
            ? "border-sky-500/30 bg-sky-500/5"
            : state === "stopping"
              ? "border-purple-500/30 bg-purple-500/5"
              : state === "stopped"
                ? "border-zinc-500/20 bg-muted/30"
                : "border-border bg-card";

  return (
    <div className={cn("rounded-lg border p-3", tone)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">Session</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={state === "error" ? "destructive" : state === "connected" ? "secondary" : "outline"}>
            {state}
          </Badge>
          {mode === "results" ? (
            <Badge variant="secondary">
              Terminé{endedLabel ? ` · ${endedLabel}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">{phase}</Badge>
          )}
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

      <div className="w-fit rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground tabular-nums sm:self-auto">
        {mode === "results" ? (
          <span>
            Fin:{" "}
            {typeof endedAtMs === "number"
              ? new Date(endedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "—"}
          </span>
        ) : phase === "prep" ? (
          <span>Prep: {formatTimeMMSS(prepSecondsLeft)}</span>
        ) : (
          <span>Temps: {formatTimeMMSS(secondsLeft)}</span>
        )}
      </div>
    </div>
      </div>
  );
}


