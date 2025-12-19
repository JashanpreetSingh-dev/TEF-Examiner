import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type OcrBody = {
  sectionKey: "A" | "B";
  id: number;
};

type OcrResult = {
  raw_text: string;
  facts: Array<{ key: string; value: string }>;
  confidence_notes?: string;
};

const memCache = new Map<string, OcrResult>();

type DiskCache = Record<string, OcrResult>;

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: { content?: unknown };
  }>;
};

const diskCachePath = path.join(process.cwd(), "src", "data", "section_a_ocr_cache.json");
let writeQueue: Promise<void> = Promise.resolve();

async function readDiskCache(): Promise<DiskCache> {
  try {
    const txt = await fs.readFile(diskCachePath, "utf8");
    const parsed = JSON.parse(txt) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as DiskCache;
  } catch {
    return {};
  }
}

async function writeDiskCache(nextCache: DiskCache) {
  // Serialize writes to avoid corruption on concurrent requests.
  writeQueue = writeQueue.then(async () => {
    const dir = path.dirname(diskCachePath);
    const tmp = path.join(dir, `section_a_ocr_cache.tmp.${Date.now()}.${Math.random().toString(16).slice(2)}.json`);
    await fs.writeFile(tmp, JSON.stringify(nextCache, null, 2) + "\n", "utf8");
    try {
      // Best-effort atomic replace. On Windows this may fail if the target exists; fallback below.
      await fs.rename(tmp, diskCachePath);
    } catch {
      try {
        await fs.unlink(diskCachePath);
      } catch {}
      await fs.rename(tmp, diskCachePath);
    }
  });
  await writeQueue;
}

function imagePathFor(sectionKey: "A" | "B", id: number) {
  const rel =
    sectionKey === "A"
      ? path.join("public", "section_a_images", `section_a_image_${id}.png`)
      : path.join("public", "section_b_images", `section_b_image_${id}.png`);
  return path.join(process.cwd(), rel);
}

export async function POST(req: Request) {
  let body: OcrBody;
  try {
    body = (await req.json()) as OcrBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sectionKey = body.sectionKey;
  const id = Number(body.id);
  if ((sectionKey !== "A" && sectionKey !== "B") || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid sectionKey or id." }, { status: 400 });
  }

  const cacheKey = `${sectionKey}:${id}`;
  const cachedMem = memCache.get(cacheKey);
  if (cachedMem) return NextResponse.json({ cached: true, source: "memory", result: cachedMem });

  // Disk cache for Section A only (committed JSON file)
  if (sectionKey === "A") {
    const disk = await readDiskCache();
    const diskHit = disk[String(id)];
    if (diskHit) {
      memCache.set(cacheKey, diskHit);
      return NextResponse.json({ cached: true, source: "disk", result: diskHit });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });

  const imgPath = imagePathFor(sectionKey, id);
  let buf: Buffer;
  try {
    buf = await fs.readFile(imgPath);
  } catch {
    return NextResponse.json({ error: "Image not found for OCR.", imgPath }, { status: 404 });
  }

  const b64 = buf.toString("base64");
  const dataUrl = `data:image/png;base64,${b64}`;

  const model = process.env.OPENAI_OCR_MODEL ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract readable advertisement text from an image and return ONLY valid JSON.\n" +
            "Return keys: raw_text (string), facts (array of {key,value}), confidence_notes (optional string).\n" +
            "facts should include concrete details only (prices, dates, times, location, contact, conditions, etc.).\n" +
            "If a detail is not present, do not invent it.\n" +
            "Write facts in French where possible.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the ad content and facts from this image." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: "OCR failed.", status: res.status, details: text }, { status: 500 });
  }

  const data = (await res.json()) as ChatCompletionsResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "Unexpected OCR response." }, { status: 500 });
  }

  let parsed: OcrResult;
  try {
    parsed = JSON.parse(content) as OcrResult;
  } catch {
    return NextResponse.json({ error: "OCR returned non-JSON.", raw: content }, { status: 500 });
  }

  // Defensive normalization
  const normalized: OcrResult = {
    raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
    facts: Array.isArray(parsed.facts)
      ? parsed.facts
          .filter((x) => x && typeof x.key === "string" && typeof x.value === "string")
          .map((x) => ({ key: x.key.trim(), value: x.value.trim() }))
      : [],
    confidence_notes: typeof parsed.confidence_notes === "string" ? parsed.confidence_notes : undefined,
  };

  memCache.set(cacheKey, normalized);

  // Persist to disk cache for Section A only
  if (sectionKey === "A") {
    const disk = await readDiskCache();
    disk[String(id)] = normalized;
    await writeDiskCache(disk);
  }

  return NextResponse.json({ cached: false, source: sectionKey === "A" ? "fresh+disk" : "fresh", result: normalized });
}


