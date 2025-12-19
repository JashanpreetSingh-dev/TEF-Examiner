import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getImageUrl, getRandomScenario, type Section } from "@/lib/kb";
import { RealtimeExamRunner } from "./realtime-exam-runner";
import { Card, CardContent } from "@/components/ui/card";

export default async function SessionPage(props: { params: Promise<{ section?: string }> }) {
  // Require authentication to start an exam
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  // Next.js 16+ provides `params` as a Promise
  const { section } = await props.params;
  if (!section) notFound();

  const normalized = section.toLowerCase();
  let sectionKey: Section;
  if (normalized === "a") sectionKey = "A";
  else if (normalized === "b") sectionKey = "B";
  else notFound();

  const scenario = getRandomScenario(sectionKey);
  const imageUrl = getImageUrl(sectionKey, scenario.id);

  return (
    <main className="mx-auto h-dvh max-w-6xl overflow-hidden p-4 sm:p-6">
      <div className="flex h-full flex-col gap-6">
        <p className="text-sm text-muted-foreground overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
          {scenario.prompt}
        </p>

        <div className="grid flex-1 min-h-0 gap-6 lg:grid-cols-2">
          <Card className="flex min-h-0 flex-col">
            <CardContent className="flex flex-1 min-h-0 flex-col p-3">
              <div className="flex-1 min-h-0 overflow-hidden rounded-lg border bg-muted">
                <Image
                  alt={`Image scenario ${scenario.id}`}
                  src={imageUrl}
                  width={1200}
                  height={900}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardContent className="flex-1 min-h-0 p-3">
              <div className="h-full min-h-0">
                <RealtimeExamRunner scenario={scenario} imageUrl={imageUrl} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}


