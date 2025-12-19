import type { TranscriptLine } from "./types";

export function TranscriptPanel(props: {
  transcript: TranscriptLine[];
  defaultOpen?: boolean;
  open?: boolean;
  onToggleOpen?: (open: boolean) => void;
}) {
  const { transcript, defaultOpen = false, open, onToggleOpen } = props;
  const isControlled = typeof open === "boolean";

  return (
    <details
      className="rounded-lg border bg-white"
      open={isControlled ? open : defaultOpen}
      onToggle={
        onToggleOpen
          ? (e) => {
              onToggleOpen((e.target as HTMLDetailsElement).open);
            }
          : undefined
      }
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
        Transcript{" "}
        <span className="text-xs font-normal text-zinc-500">
          ({transcript.length ? `${transcript.length} lignes` : "vide"})
        </span>
      </summary>
      <div className="min-h-0 max-h-80 overflow-auto border-t p-3">
        {transcript.length === 0 ? (
          <div className="text-sm text-zinc-500">
            Cliquez <span className="font-medium">Démarrer</span>, autorisez le micro, puis parlez normalement.
          </div>
        ) : (
          <div className="space-y-3">
            {transcript.map((line) => (
              <div key={line.id} className="text-sm">
                <div className="text-xs font-medium text-zinc-500">
                  {line.role === "assistant" ? "Examinateur" : line.role === "user" ? "Candidat" : "Système"}
                </div>
                <div className="whitespace-pre-wrap text-zinc-900">{line.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}


