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
      <button
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={onStart}
        disabled={!canStart}
      >
        Démarrer
      </button>
      <button
        className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        onClick={onStop}
        disabled={!canStop}
      >
        Arrêter
      </button>
      <button
        className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        onClick={onEvaluate}
        disabled={!canEvaluate}
      >
        {isEvaluating ? "Évaluation..." : "Évaluer"}
      </button>
    </div>
  );
}


