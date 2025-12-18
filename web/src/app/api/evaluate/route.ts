import { NextResponse } from "next/server";

import type { Scenario } from "@/lib/kb";

export const runtime = "nodejs";

type EvaluateBody = {
  scenario: Pick<Scenario, "sectionKey" | "id" | "prompt" | "time_limit_sec">;
  transcript: Array<{ role: "user" | "assistant" | "system"; text: string }>;
};

type EvalResult = {
  overall_band_estimate: string;
  overall_comment: string;
  criteria: Array<{
    name: string;
    score_0_10: number;
    comment: string;
    improvements: string[];
  }>;
  strengths: string[];
  top_improvements: string[];
  upgraded_sentences: Array<{
    weak: string;
    better: string;
    why: string;
  }>;
};

function buildRubricSystemPrompt(sectionKey: "A" | "B") {
  return [
    "You are a strict but helpful TEF Canada Expression Orale evaluator.",
    "Return ONLY valid JSON (no markdown).",
    "The candidate speaks French. Evaluate the candidate’s performance only (ignore examiner content).",
    "If transcript is too short or missing, say so and give safe general advice.",
    "",
    "Score criteria from 0 to 10 (integer). Provide concise, actionable feedback.",
    "",
    sectionKey === "A"
      ? "EO1 focus: interactional competence, asking relevant questions, clarity, register, turn-taking, reactivity."
      : "EO2 focus: persuasion, argument structure, handling counter-arguments, coherence, examples, nuance.",
    "",
    "Use these criteria (adapt comments to the section):",
    "- Task fulfillment / pertinence",
    "- Coherence & organization",
    "- Lexical range & appropriateness",
    "- Grammar control",
    "- Fluency & pronunciation (as inferred from transcript)",
    "- Interaction (turn-taking, reactivity, sociolinguistic appropriateness)",
    "",
    "Output JSON with keys: overall_band_estimate, overall_comment, criteria, strengths, top_improvements, upgraded_sentences.",
  ].join("\n");
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
  }

  let body: EvaluateBody;
  try {
    body = (await req.json()) as EvaluateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { scenario, transcript } = body;
  if (!scenario?.sectionKey || !scenario?.prompt || !scenario?.id) {
    return NextResponse.json({ error: "Missing scenario fields." }, { status: 400 });
  }

  const candidateText = transcript
    .filter((l) => l.role === "user")
    .map((l) => l.text)
    .join("\n")
    .trim();

  const model = process.env.OPENAI_EVAL_MODEL ?? "gpt-4o-mini";

  const messages = [
    { role: "system" as const, content: buildRubricSystemPrompt(scenario.sectionKey) },
    {
      role: "user" as const,
      content: [
        `Section: ${scenario.sectionKey === "A" ? "EO1" : "EO2"}`,
        `Scenario ID: ${scenario.id}`,
        `Time limit (sec): ${scenario.time_limit_sec ?? ""}`,
        `Prompt (French): ${scenario.prompt}`,
        "",
        "Candidate transcript (French):",
        candidateText || "(empty)",
      ].join("\n"),
    },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to evaluate transcript.", status: res.status, details: text },
      { status: 500 },
    );
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "Unexpected evaluator response." }, { status: 500 });
  }

  let parsed: EvalResult | null = null;
  try {
    parsed = JSON.parse(content) as EvalResult;
  } catch {
    // fall through
  }

  return NextResponse.json({
    model,
    result: parsed ?? { raw: content },
  });
}


