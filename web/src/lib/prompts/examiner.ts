import type { Scenario } from "@/lib/kb";

type BrevityPreset = "short" | "medium" | "adaptive";

function envBrevityPreset(): BrevityPreset {
  const raw = String(process.env.NEXT_PUBLIC_EXAMINER_BREVITY_PRESET ?? "short").toLowerCase().trim();
  if (raw === "medium" || raw === "adaptive") return raw;
  return "short";
}

function envInt(name: string, fallback: number) {
  const v = Number.parseInt(String(process.env[name] ?? ""), 10);
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
    "Pas de listes, pas d’explications longues, pas de monologue. " +
    "TERMINE PROPREMENT: ne commence pas une nouvelle phrase si tu ne peux pas la finir; " +
    "si tu manques de place/temps, conclus immédiatement en 3–6 mots."
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
    // Cost/control: keep responses short and avoid padding.
    "Concision stricte: réponds uniquement au point demandé, sans préambule, sans reformulation, sans justification longue.",
    "Format: maximum 3 lignes (retours à la ligne).",
    "Après avoir répondu: arrête-toi. N'ajoute rien sauf si le candidat pose une nouvelle question ou si une clarification est indispensable.",
    makeBrevityInstruction(scenario.sectionKey, "generic"),
  ];

  if (scenario.sectionKey === "A") {
    const facts = (ocr?.facts ?? []).map((f) => `- ${f.key}: ${f.value}`).join("\n");
    return [
      ...base,
      "Épreuve EO1: interaction type appel téléphonique.",
      "Tu joues l’interlocuteur (standard, vendeur, organisateur, etc.).",
      "Le candidat pilote l’appel en posant des questions. Tu réponds uniquement à ce qui est demandé.",
      "Si le candidat commence par une phrase générale du type « je voudrais des informations / je veux poser des questions / je vous appelle pour me renseigner », réponds uniquement: « Très bien, quelle est votre question ? » (ou équivalent), sans donner d'informations sur l'annonce.",
      "Tu ne suggères PAS quelles questions poser. Tu ne listes pas d’informations spontanément.",
      "INTERDICTION: ne pose PAS de questions de relance. Ne demande jamais d’informations au candidat. Ne termine jamais par une question.",
      "Tu peux poser UNE SEULE question de clarification uniquement si la demande est ambiguë ou incompréhensible. Sinon: aucune question.",
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
    "Ne débute pas par des contre-arguments avant que le candidat ait commencé à parler (le candidat parle en premier).",
    "Au début, réponds simplement aux salutations et laisse le candidat présenter son idée/projet sans objection (petites phrases d’écoute: « ah d’accord », « raconte-moi », etc.).",
    "Ensuite, tu utilises des contre-arguments progressivement (pas tous à la fois) et tu demandes des justifications/exemples.",
    "Tes contre-arguments doivent être brefs (1–2 phrases maximum).",
    "Après chaque contre-argument, le candidat essaie de te convaincre.",
    "Si le candidat répond de façon raisonnable à un contre-argument, considère ce point comme partiellement résolu et passe à un AUTRE contre-argument de la liste (ne reste pas bloqué sur le même).",
    "Tu ne répètes pas les mêmes objections: à chaque fois que le candidat répond sérieusement, tu choisis un autre contre-argument de la liste.",
    "CONTRAINTE ABSOLUE: tu dois utiliser UNIQUEMENT les contre-arguments ci-dessous (tu peux paraphraser), et tu ne dois PAS inventer de nouvelles objections.",
    "Choisis le prochain contre-argument en fonction de ce que le candidat vient de dire.",
    "Le ton reste amical et informel, comme une vraie discussion entre ami(e)s.",
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

function envTokens(name: string, fallback: number) {
  const v = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function examinerMaxOutputTokens(sectionKey: "A" | "B", reason: "generic" | "warning" | "timeout") {
  // Conservative defaults (cost control). These are caps, not targets.
  const defaults =
    reason === "warning" ? 80 : reason === "timeout" ? 120 : sectionKey === "A" ? 100 : 140;

  const base = envTokens("NEXT_PUBLIC_EXAMINER_MAX_OUTPUT_TOKENS", defaults);
  const sectionOverride =
    sectionKey === "A"
      ? envTokens("NEXT_PUBLIC_EO1_EXAMINER_MAX_OUTPUT_TOKENS", base)
      : envTokens("NEXT_PUBLIC_EO2_EXAMINER_MAX_OUTPUT_TOKENS", base);

  // Optional reason-specific overrides (rarely needed, but nice to have).
  const reasonOverride =
    reason === "warning"
      ? envTokens("NEXT_PUBLIC_EXAMINER_WARNING_MAX_OUTPUT_TOKENS", sectionOverride)
      : reason === "timeout"
        ? envTokens("NEXT_PUBLIC_EXAMINER_TIMEOUT_MAX_OUTPUT_TOKENS", sectionOverride)
        : sectionOverride;

  // Final safety clamp.
  return Math.max(16, Math.min(reasonOverride, 1000));
}


