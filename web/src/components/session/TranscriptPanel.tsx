import type { TranscriptLine } from "./types";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function TranscriptPanel(props: {
  transcript: TranscriptLine[];
  defaultOpen?: boolean;
  open?: boolean;
  onToggleOpen?: (open: boolean) => void;
}) {
  const { transcript, defaultOpen = false, open, onToggleOpen } = props;
  const isControlled = typeof open === "boolean";

  return (
    <Collapsible
      open={isControlled ? open : undefined}
      defaultOpen={isControlled ? undefined : defaultOpen}
      onOpenChange={onToggleOpen}
      className="rounded-lg border bg-card"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="text-sm font-medium">
          Transcript{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({transcript.length ? `${transcript.length} lignes` : "vide"})
          </span>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            {isControlled ? (open ? "Masquer" : "Afficher") : "Afficher"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", isControlled && open ? "rotate-180" : "")} />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="border-t">
        <div className="min-h-0 max-h-80 overflow-auto p-3">
          {transcript.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Cliquez <span className="font-medium">Démarrer</span>, autorisez le micro, puis parlez normalement.
            </div>
          ) : (
            <div className="space-y-3">
              {transcript.map((line) => (
                <div key={line.id} className="text-sm">
                  <div className="text-xs font-medium text-muted-foreground">
                    {line.role === "assistant" ? "Examinateur" : line.role === "user" ? "Candidat" : "Système"}
                  </div>
                  <div className="whitespace-pre-wrap">{line.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}


