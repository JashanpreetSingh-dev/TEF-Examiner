import { NextResponse } from "next/server";

import type { Scenario } from "@/lib/kb";
import { buildRubricSystemPrompt } from "@/lib/prompts/evaluation";

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

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: { content?: unknown };
  }>;
};

type EvalMetrics = {
  eo1_question_count?: number;
  eo1_question_target?: string;
  eo1_question_count_method?: "punctuation" | "heuristic";
};

function estimateQuestionCount(candidateText: string): { count: number; method: "punctuation" | "heuristic" } {
  const raw = candidateText ?? "";
  const qMarks = (raw.match(/\?/g) ?? []).length;
  if (qMarks > 0) return { count: qMarks, method: "punctuation" };

  const text = raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { count: 0, method: "heuristic" };

  const interrogativeStart = /^\s*(est-ce|est ce|est-ce que|est ce que|qu[' ]|quoi|quel(le)?s?|combien|où|ou|quand|comment|pourquoi|qui)\b/;
  const interrogativeAny = /\b(est-ce|est ce|est-ce que|est ce que|pouvez[- ]vous|pourriez[- ]vous|avez[- ]vous|est[- ]il|est[- ]ce|y a[- ]t[- ]il|je (voudrais|voulais) savoir)\b/;

  // Split into rough utterances; speech-to-text often lacks punctuation, so also split on newlines.
  const parts = text
    .split(/[\n.!;:]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  let count = 0;
  for (const p of parts) {
    if (interrogativeStart.test(p) || interrogativeAny.test(p)) count += 1;
  }

  // Avoid wildly over-counting in long paragraphs: cap to a sane range.
  count = Math.max(0, Math.min(count, 30));
  return { count, method: "heuristic" };
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

  const metrics: EvalMetrics = {};
  if (scenario.sectionKey === "A") {
    const { count, method } = estimateQuestionCount(candidateText);
    metrics.eo1_question_count = count;
    metrics.eo1_question_target = "9–10";
    metrics.eo1_question_count_method = method;
  }

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
        ...(scenario.sectionKey === "A"
          ? [
              `EO1 metric — estimated questions asked: ${metrics.eo1_question_count ?? 0} (target ${metrics.eo1_question_target}).`,
              `Metric method: ${metrics.eo1_question_count_method ?? "heuristic"}.`,
              "When scoring Task fulfillment / pertinence and Interaction, account for whether enough relevant questions were asked.",
            ]
          : []),
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

  const data = (await res.json()) as ChatCompletionsResponse;
  const content = data.choices?.[0]?.message?.content;
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
    metrics,
    result: parsed ?? { raw: content },
  });
}


