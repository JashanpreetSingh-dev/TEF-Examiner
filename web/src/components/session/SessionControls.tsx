import { Button } from "@/components/ui/button";

export function SessionControls(props: {
  mode: "live" | "results";
  onStart?: () => void;
  onEvaluate?: () => void;
  canStart: boolean;
  canEvaluate: boolean;
  evaluationStatus?: "idle" | "loading" | "done" | "error";
}) {
  const { mode, onStart, onEvaluate, canStart, canEvaluate, evaluationStatus } = props;
  const isEvaluating = evaluationStatus === "loading";

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {mode === "live" ? (
        <>
          <Button onClick={onStart} disabled={!canStart}>
            Démarrer
          </Button>
          <Button variant="secondary" onClick={onEvaluate} disabled={!canEvaluate}>
            Évaluer
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onEvaluate} disabled={!canEvaluate}>
            {isEvaluating ? "Évaluation..." : "Évaluer"}
          </Button>
          <Button variant="outline" onClick={onStart} disabled={!canStart}>
            Recommencer
          </Button>
        </>
      )}
    </div>
  );
}


