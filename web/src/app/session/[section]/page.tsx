import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getImageUrl, getRandomScenario, type Section } from "@/lib/kb";
import { RealtimeExamRunner } from "./realtime-exam-runner";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default async function SessionPage(props: { params: Promise<{ section?: string }> | { section?: string } }) {
  // Next.js 15+ may provide `params` as a Promise (sync dynamic APIs)
  const { section } = await Promise.resolve(props.params);
  if (!section) notFound();

  const normalized = section.toLowerCase();
  let sectionKey: Section;
  if (normalized === "a") sectionKey = "A";
  else if (normalized === "b") sectionKey = "B";
  else notFound();

  const scenario = getRandomScenario(sectionKey);
  const imageUrl = getImageUrl(sectionKey, scenario.id);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">TEF Canada</Badge>
              <Badge variant="outline">{sectionKey === "A" ? "EO1" : "EO2"}</Badge>
              <Badge variant="secondary">{Math.round(scenario.time_limit_sec / 60)} min</Badge>
              <Badge variant="outline">Scenario #{scenario.id}</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {sectionKey === "A" ? "Section A — Interaction" : "Section B — Argumentation"}
            </h1>
            <p className="text-sm text-muted-foreground">{scenario.prompt}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/">Retour</Link>
            </Button>
            <ModeToggle />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Document</CardTitle>
              <CardDescription>Image sélectionnée aléatoirement pour ce scénario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                <Image
                  alt={`Image scenario ${scenario.id}`}
                  src={imageUrl}
                  width={1200}
                  height={900}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>

              <Accordion type="single" collapsible>
                <AccordionItem value="hints">
                  <AccordionTrigger>
                    {scenario.sectionKey === "A" ? "Thèmes possibles (pour vous)" : "Contre-arguments (référence)"}
                  </AccordionTrigger>
                  <AccordionContent>
                    {scenario.sectionKey === "A" ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {scenario.suggested_questions.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {scenario.counter_arguments.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <CardDescription>Conversation en temps réel + transcription + évaluation.</CardDescription>
            </CardHeader>
            <CardContent>
              <RealtimeExamRunner scenario={scenario} imageUrl={imageUrl} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}


