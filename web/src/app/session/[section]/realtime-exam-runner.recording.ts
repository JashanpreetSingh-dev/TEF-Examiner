import type { MutableRefObject } from "react";

export interface RecordingRefs {
  recorder: MutableRefObject<MediaRecorder | null>;
  chunks: MutableRefObject<Blob[]>;
  mimeType: MutableRefObject<string>;
}

export function startRecording(stream: MediaStream, refs: RecordingRefs) {
  try {
    if (refs.recorder.current) return;
    refs.chunks.current = [];

    const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    refs.mimeType.current = mimeType;

    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    refs.recorder.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) refs.chunks.current.push(e.data);
    };

    // Small timeslice keeps memory stable for long sessions.
    rec.start(1000);
  } catch {
    refs.recorder.current = null;
    refs.chunks.current = [];
    refs.mimeType.current = "";
  }
}

export async function stopRecording(refs: RecordingRefs): Promise<Blob | null> {
  const rec = refs.recorder.current;
  if (!rec) return null;

  if (rec.state === "inactive") {
    refs.recorder.current = null;
    const chunks = refs.chunks.current;
    refs.chunks.current = [];
    const type = refs.mimeType.current || chunks[0]?.type || "audio/webm";
    return chunks.length ? new Blob(chunks, { type }) : null;
  }

  const done = new Promise<void>((resolve) => {
    const prev = rec.onstop;
    rec.onstop = (ev: Event) => {
      try {
        if (typeof prev === "function") prev.call(rec, ev);
      } finally {
        resolve();
      }
    };
  });

  try {
    rec.stop();
  } catch {}

  await done;

  refs.recorder.current = null;
  const chunks = refs.chunks.current;
  refs.chunks.current = [];
  const type = refs.mimeType.current || chunks[0]?.type || "audio/webm";
  return chunks.length ? new Blob(chunks, { type }) : null;
}

export async function transcribeCandidateAudio(audio: Blob | null): Promise<string> {
  if (!audio) return "";
  try {
    const fd = new FormData();
    fd.set("audio", audio, "candidate.webm");
    const res = await fetch("/api/transcribe", { method: "POST", body: fd });
    if (!res.ok) return "";
    const json = (await res.json().catch(() => null)) as null | { text?: unknown };
    return typeof json?.text === "string" ? json.text.trim() : "";
  } catch {
    return "";
  }
}

