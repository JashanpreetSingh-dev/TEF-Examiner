import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();

  // Marketing page for unauthenticated users
  if (!userId) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-4xl p-4 sm:p-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Simulateur TEF Canada</h1>
            <p className="text-sm text-muted-foreground">
              Préparez-vous à l&apos;examen d&apos;expression orale avec un simulateur réaliste utilisant l&apos;IA.
            </p>
          </header>

          <div className="mt-12 space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold">Pratiquez l&apos;expression orale du TEF Canada</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Simulez les sections EO1 et EO2 avec un examinateur virtuel alimenté par l&apos;IA. Recevez des
                évaluations détaillées et des pistes d&apos;amélioration pour progresser.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Section A (EO1)</CardTitle>
                    <Badge variant="secondary">5 min</Badge>
                  </div>
                  <CardDescription>Interaction — Appel téléphonique</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Vous appelez pour obtenir des informations. L&apos;examinateur répond à vos questions en temps réel.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>Posez des questions pertinentes</li>
                    <li>Interagissez naturellement</li>
                    <li>Respectez le format de l&apos;examen</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Section B (EO2)</CardTitle>
                    <Badge variant="secondary">10 min</Badge>
                  </div>
                  <CardDescription>Argumentation — Convaincre un(e) ami(e)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Vous essayez de convaincre. L&apos;ami(e) utilise des contre-arguments réalistes pour tester votre
                    argumentation.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>Développez vos arguments</li>
                    <li>Répondez aux objections</li>
                    <li>Persuadez efficacement</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle>Fonctionnalités</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2 list-disc pl-5 text-sm text-muted-foreground">
                  <li>Examinateur virtuel en voix avec OpenAI Realtime</li>
                  <li>Évaluation automatique avec feedback détaillé</li>
                  <li>Historique de vos sessions pour suivre votre progression</li>
                  <li>Simulation fidèle aux conditions réelles de l&apos;examen</li>
                </ul>
              </CardContent>
            </Card>

            <div className="text-center space-y-4 pt-4">
              <p className="text-lg font-medium">Prêt à commencer ?</p>
              <p className="text-sm text-muted-foreground">
                Utilisez les boutons de connexion dans la barre de navigation pour créer un compte gratuit et accéder au simulateur.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Authenticated users see the exam dashboard
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Simulateur (EO1 / EO2)</h1>
          <p className="text-sm text-muted-foreground">
            Choisissez une section puis lancez une simulation. L&apos;examinateur est simulé en voix via l&apos;API Realtime.
          </p>
        </header>

        {/* Mobile: tabs. Desktop: 2-column cards. */}
        <div className="mt-8 sm:hidden">
          <Tabs defaultValue="a">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="a">Section A</TabsTrigger>
              <TabsTrigger value="b">Section B</TabsTrigger>
            </TabsList>

            <TabsContent value="a" className="mt-4">
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
                    Vous appelez pour obtenir des informations. Vous posez les questions, l&apos;interlocuteur répond.
                  </p>
                  <Button asChild className="w-full">
                    <Link href="/session/a">Commencer EO1</Link>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="b" className="mt-4">
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
                    Vous essayez de convaincre. L&apos;ami(e) utilise des contre-arguments (liste fournie).
                  </p>
                  <Button asChild className="w-full">
                    <Link href="/session/b">Commencer EO2</Link>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-8 hidden gap-4 sm:grid sm:grid-cols-2">
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
                    Vous appelez pour obtenir des informations. Vous posez les questions, l&apos;interlocuteur répond.
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
                    Vous essayez de convaincre. L&apos;ami(e) utilise des contre-arguments (liste fournie).
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
              <li>Autorisez l&apos;accès au micro lorsque le navigateur le demande.</li>
              <li>Parlez uniquement en français (comme à l&apos;examen).</li>
              <li>À la fin, vous recevrez une évaluation et des pistes d&apos;amélioration.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
