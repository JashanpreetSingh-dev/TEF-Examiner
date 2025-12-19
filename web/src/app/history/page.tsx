import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { HistoryList } from "@/components/history/HistoryList";
import { getResultsCollection } from "@/lib/db";
import type { ExamResultDocument } from "@/lib/models/ExamResult";

type HistoryApiResult = Pick<
  ExamResultDocument,
  "sessionId" | "sectionKey" | "scenarioPrompt" | "endedAt" | "endedReason" | "evaluation"
>;

export default async function HistoryPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const collection = await getResultsCollection();

  const results = (await collection
    .find({ userId })
    .project({
      _id: 0,
      userId: 0,
      finalTranscript: 0,
      finalTranscriptForEval: 0,
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()) as HistoryApiResult[];

  return (
    <main className="mx-auto min-h-dvh max-w-4xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/session/a">Nouvelle tâche (Section A)</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/session/b">Nouvelle tâche (Section B)</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Accueil</Link>
          </Button>
        </div>
        <ModeToggle />
      </div>

      <div className="mt-6 space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Historique des simulations</h1>
        <HistoryList results={results} />
      </div>
    </main>
  );
}


