import type { Scenario } from "@/lib/kb";

type BrevityPreset = "short" | "medium" | "adaptive";

function envBrevityPreset(): BrevityPreset {
  const raw = String(process.env.NEXT_PUBLIC_EXAMINER_BREVITY_PRESET ?? "short").toLowerCase().trim();
  if (raw === "medium" || raw === "adaptive") return raw;
  return "short";
}

function envInt(name: string, fallback: number) {
  const v = Number.parseInt(String((process.env as any)[name] ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function brevityFor(
  sectionKey: "A" | "B",
  reason: "generic" | "warning" | "timeout",
): { maxSentences: number; approxSeconds: number } {
  const preset = envBrevityPreset();

  const defaults =
    preset === "medium"
      ? { maxSentences: 3, approxSeconds: 25 }
      : preset === "adaptive"
        ? reason === "warning" || reason === "timeout"
          ? { maxSentences: 1, approxSeconds: 10 }
          : { maxSentences: 2, approxSeconds: 15 }
        : { maxSentences: 2, approxSeconds: 15 };

  // EO1 should stay concise by default.
  const clampedDefaults =
    sectionKey === "A"
      ? { maxSentences: Math.min(defaults.maxSentences, 3), approxSeconds: Math.min(defaults.approxSeconds, 15) }
      : defaults;

  // Section-specific overrides first (if provided), then general overrides.
  const maxSentences =
    sectionKey === "A"
      ? envInt(
          "NEXT_PUBLIC_EO1_EXAMINER_MAX_SENTENCES",
          envInt("NEXT_PUBLIC_EXAMINER_MAX_SENTENCES", clampedDefaults.maxSentences),
        )
      : envInt(
          "NEXT_PUBLIC_EO2_EXAMINER_MAX_SENTENCES",
          envInt("NEXT_PUBLIC_EXAMINER_MAX_SENTENCES", clampedDefaults.maxSentences),
        );

  const approxSeconds =
    sectionKey === "A"
      ? envInt(
          "NEXT_PUBLIC_EO1_EXAMINER_MAX_SECONDS",
          envInt("NEXT_PUBLIC_EXAMINER_MAX_SECONDS", clampedDefaults.approxSeconds),
        )
      : envInt(
          "NEXT_PUBLIC_EO2_EXAMINER_MAX_SECONDS",
          envInt("NEXT_PUBLIC_EXAMINER_MAX_SECONDS", clampedDefaults.approxSeconds),
        );

  return { maxSentences, approxSeconds };
}

export function makeBrevityInstruction(sectionKey: "A" | "B", reason: "generic" | "warning" | "timeout") {
  const { maxSentences, approxSeconds } = brevityFor(sectionKey, reason);
  return (
    `Brièveté obligatoire: ${maxSentences} phrase${maxSentences > 1 ? "s" : ""} maximum ` +
    `(≈${approxSeconds} secondes). ` +
    "Pas de listes, pas d’explications longues, pas de monologue."
  );
}

export function makeExamInstructions(
  scenario: Scenario,
  ocr: null | { raw_text: string; facts: Array<{ key: string; value: string }> },
) {
  const base = [
    "Tu es un examinateur TEF Canada (Expression Orale).",
    "Tu dois simuler l’épreuve de manière réaliste et dynamique.",
    "Tu parles uniquement en français.",
    "Objectif: simuler une interaction réaliste selon la tâche; rester naturel.",
    "Style: naturel, professionnel, mais pas robotique.",
    "IMPORTANT: ne corrige pas le candidat pendant l’épreuve. Pas de conseils pédagogiques, pas d’explications de grammaire. Pas de coaching.",
    makeBrevityInstruction(scenario.sectionKey, "generic"),
  ];

  if (scenario.sectionKey === "A") {
    const facts = (ocr?.facts ?? []).map((f) => `- ${f.key}: ${f.value}`).join("\n");
    return [
      ...base,
      "Épreuve EO1: interaction type appel téléphonique.",
      "Tu joues l’interlocuteur (standard, vendeur, organisateur, etc.).",
      "Le candidat pilote l’appel en posant des questions. Tu réponds uniquement à ce qui est demandé.",
      "Tu ne suggères PAS quelles questions poser. Tu ne listes pas d’informations spontanément.",
      "Tu peux poser une question de clarification uniquement si la demande est ambiguë ou incompréhensible.",
      "Réponses: professionnelles, concises (1–2 phrases), ton téléphone. Donne les détails progressivement, seulement quand on te les demande.",
      "Priorité d'information: utilise d'abord les informations de l'annonce (OCR) ci-dessous si elles existent.",
      "Si un détail n'apparaît pas dans l'annonce, invente une information plausible (ex: prix, horaires, modalités) et présente-la comme un fait.",
      "IMPORTANT: si tu inventes un détail, reste cohérent ensuite (même prix, mêmes horaires, même adresse) pendant tout l'appel.",
      `Consigne: ${scenario.prompt}`,
      "Informations de l'annonce (OCR):",
      facts || "- (aucune information extraite)",
    ].join("\n");
  }

  return [
    ...base,
    "Épreuve EO2: argumentation / persuasion.",
    "Le candidat doit convaincre un(e) ami(e). Tu joues l’ami(e) sceptique.",
    "Tu utilises des contre-arguments progressivement (pas tous à la fois) et tu demandes des justifications/exemples.",
    "CONTRAINTE ABSOLUE: tu dois utiliser UNIQUEMENT les contre-arguments ci-dessous (tu peux paraphraser), et tu ne dois PAS inventer de nouvelles objections.",
    "Choisis le prochain contre-argument en fonction de ce que le candidat vient de dire.",
    "Ne débute pas par des contre-arguments avant que le candidat ait commencé à parler (le candidat parle en premier).",
    `Consigne: ${scenario.prompt}`,
    `Contre-arguments possibles (à utiliser graduellement): ${scenario.counter_arguments.join(" | ")}`,
  ].join("\n");
}

export function makePrebrief(scenario: Scenario) {
  if (scenario.sectionKey === "A") {
    return [
      "Vous allez faire l’épreuve d’expression orale, section A (EO1).",
      "Vous allez voir une image et une consigne.",
      "Je vais vous laisser 60 secondes pour lire et vous préparer. Pendant ce temps, ne parlez pas.",
      "Ensuite, je commencerai l’appel téléphonique et vous poserez vos questions.",
    ].join(" ");
  }

  return [
    "Vous allez faire l’épreuve d’expression orale, section B (EO2).",
    "Vous allez voir une image et une consigne.",
    "Je vais vous laisser 60 secondes pour lire et vous préparer. Pendant ce temps, ne parlez pas.",
    "Ensuite, vous commencerez à parler en premier pour essayer de me convaincre.",
  ].join(" ");
}


