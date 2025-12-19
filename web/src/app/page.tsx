import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">TEF Canada</Badge>
              <Badge variant="outline">Expression Orale</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Simulateur (EO1 / EO2)</h1>
            <p className="text-sm text-muted-foreground">
              Choisissez une section puis lancez une simulation. L’examinateur est simulé en voix via l’API Realtime.
            </p>
          </div>
          <ModeToggle />
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Section A</CardTitle>
                <Badge variant="secondary">5 min</Badge>
              </div>
              <CardDescription>EO1 — Interaction (appel téléphonique)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Vous appelez pour obtenir des informations. Vous posez les questions, l’interlocuteur répond.
              </p>
              <Button asChild className="w-full">
                <Link href="/session/a">Commencer EO1</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Section B</CardTitle>
                <Badge variant="secondary">10 min</Badge>
              </div>
              <CardDescription>EO2 — Argumentation (convaincre un(e) ami(e))</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Vous essayez de convaincre. L’ami(e) utilise des contre-arguments (liste fournie).
              </p>
              <Button asChild className="w-full">
                <Link href="/session/b">Commencer EO2</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Avant de commencer</CardTitle>
            <CardDescription>Quelques conseils rapides pour une simulation réaliste.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Autorisez l’accès au micro lorsque le navigateur le demande.</li>
              <li>Parlez uniquement en français (comme à l’examen).</li>
              <li>À la fin, vous recevrez une évaluation et des pistes d’amélioration.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
