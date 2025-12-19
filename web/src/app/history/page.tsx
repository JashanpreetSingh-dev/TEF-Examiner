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
  "sessionId" | "sectionKey" | "scenarioId" | "scenarioPrompt" | "endedAt" | "endedReason" | "evaluation"
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
    <main className="mx-auto min-h-dvh max-w-4xl p-3 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <Button asChild variant="outline">
          <Link href="/">Retour</Link>
        </Button>
        <ModeToggle />
      </header>

      <div className="mt-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Historique des simulations</h1>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/session/a">Nouvelle tâche (Section A)</Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/session/b">Nouvelle tâche (Section B)</Link>
            </Button>
          </div>
        </div>

        <HistoryList results={results} />
      </div>
    </main>
  );
}


