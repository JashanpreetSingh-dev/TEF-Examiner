import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file field 'audio'." }, { status: 400 });
  }

  const model = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
  const language = (process.env.OPENAI_TRANSCRIBE_LANGUAGE ?? "fr").trim() || "fr";

  const fd = new FormData();
  fd.set("model", model);
  fd.set("language", language);
  // Provide a filename so OpenAI accepts it as an uploaded file.
  fd.append("file", audio, "candidate.webm");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: "Transcription failed.", status: res.status, details: text }, { status: 500 });
  }

  const json = (await res.json().catch(() => null)) as null | { text?: unknown };
  const text = typeof json?.text === "string" ? json.text : "";

  return NextResponse.json({ model, language, text });
}


