import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CreateRealtimeSessionResponse = {
  client_secret?: { value: string; expires_at?: number };
  // the API may return additional fields; we only rely on client_secret.value
  [k: string]: unknown;
};

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY on server." },
      { status: 500 },
    );
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-mini-realtime-preview";
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "alloy";

  // API ref: "Client secrets" (Realtime sessions) — returns client_secret.value
  const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "realtime=v1",
    },
    body: JSON.stringify({
      model,
      voice,
      // Keep config minimal here; the browser will do `session.update` after connect.
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to create Realtime session.", status: res.status, details: text },
      { status: 500 },
    );
  }

  const data = (await res.json()) as CreateRealtimeSessionResponse;
  const token = data.client_secret?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Realtime session response missing client_secret.value." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    token,
    expires_at: data.client_secret?.expires_at ?? null,
    model,
    voice,
  });
}


