import { Button } from "@/components/ui/button";

export function SessionControls(props: {
  onStart?: () => void;
  onStop?: () => void;
  onEvaluate?: () => void;
  canStart: boolean;
  canStop: boolean;
  canEvaluate: boolean;
  isEvaluating?: boolean;
}) {
  const { onStart, onStop, onEvaluate, canStart, canStop, canEvaluate, isEvaluating } = props;

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onStart} disabled={!canStart}>
        Démarrer
      </Button>
      <Button variant="outline" onClick={onStop} disabled={!canStop}>
        Arrêter
      </Button>
      <Button variant="secondary" onClick={onEvaluate} disabled={!canEvaluate}>
        {isEvaluating ? "Évaluation..." : "Évaluer"}
      </Button>
    </div>
  );
}


