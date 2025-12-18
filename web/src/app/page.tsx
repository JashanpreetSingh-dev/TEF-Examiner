import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">TEF Canada — Expression Orale (Simulateur)</h1>
          <p className="text-zinc-700">
            Choisissez une section, puis lancez une simulation avec une image aléatoire. L’examinateur est simulé en
            <span className="font-medium"> voix</span> via l’API Realtime.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/session/a"
            className="rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            <div className="space-y-2">
              <div className="text-sm font-medium text-zinc-600">Section A</div>
              <div className="text-xl font-semibold">EO1 — Interaction (5 min)</div>
              <div className="text-sm text-zinc-700">Appel téléphonique: poser des questions et obtenir des infos.</div>
            </div>
          </Link>

          <Link
            href="/session/b"
            className="rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            <div className="space-y-2">
              <div className="text-sm font-medium text-zinc-600">Section B</div>
              <div className="text-xl font-semibold">EO2 — Argumentation (10 min)</div>
              <div className="text-sm text-zinc-700">Convaincre un(e) ami(e) et répondre aux contre-arguments.</div>
            </div>
          </Link>
        </div>

        <div className="mt-10 rounded-xl border bg-white p-5 text-sm text-zinc-700">
          <div className="font-medium text-zinc-900">Avant de commencer</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Autorisez l’accès au micro lorsque le navigateur le demande.</li>
            <li>Parlez uniquement en français (comme à l’examen).</li>
            <li>À la fin, vous recevrez une évaluation et des pistes d’amélioration.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
