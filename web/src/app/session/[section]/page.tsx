import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getImageUrl, getRandomScenario, type Section } from "@/lib/kb";
import { RealtimeExamRunner } from "./realtime-exam-runner";

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
    <main className="mx-auto max-w-5xl p-6">
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">
              TEF Canada — Expression Orale {sectionKey === "A" ? "Section A (EO1)" : "Section B (EO2)"}
            </h1>
            <p className="text-sm text-zinc-600">
              Scenario #{scenario.id} • Temps: {Math.round(scenario.time_limit_sec / 60)} min
            </p>
          </div>
          <Link className="text-sm text-blue-600 hover:underline" href="/">
            Changer de section
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-zinc-50">
                <Image
                  alt={`Image scenario ${scenario.id}`}
                  src={imageUrl}
                  width={1200}
                  height={900}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <div className="space-y-2">
                <h2 className="font-medium">Consigne</h2>
                <p className="text-sm leading-6 text-zinc-800">{scenario.prompt}</p>
                {scenario.sectionKey === "A" ? (
                  <details className="rounded-lg border bg-zinc-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Questions suggérées</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                      {scenario.suggested_questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <details className="rounded-lg border bg-zinc-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Contre-arguments (pour l’examinateur)</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                      {scenario.counter_arguments.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <RealtimeExamRunner scenario={scenario} imageUrl={imageUrl} />
          </section>
        </div>
      </div>
    </main>
  );
}


