import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    from: null,
    to: null,
    limit: null,
    sleepMs: 250,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--from" && next) {
      args.from = Number(next);
      i++;
    } else if (a === "--to" && next) {
      args.to = Number(next);
      i++;
    } else if (a === "--limit" && next) {
      args.limit = Number(next);
      i++;
    } else if (a === "--sleep-ms" && next) {
      args.sleepMs = Number(next);
      i++;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadDotEnvLocal(webRoot) {
  try {
    const txt = await fs.readFile(path.join(webRoot, ".env.local"), "utf8");
    const kv = parseEnvFile(txt);
    for (const [k, v] of Object.entries(kv)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ok
  }
}

async function readJson(filePath, fallback) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `section_a_ocr_cache.tmp.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.json`,
  );
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  try {
    await fs.rename(tmp, filePath);
  } catch {
    try {
      await fs.unlink(filePath);
    } catch {}
    await fs.rename(tmp, filePath);
  }
}

function normalizeOcr(parsed) {
  return {
    raw_text: typeof parsed?.raw_text === "string" ? parsed.raw_text : "",
    facts: Array.isArray(parsed?.facts)
      ? parsed.facts
          .filter((x) => x && typeof x.key === "string" && typeof x.value === "string")
          .map((x) => ({ key: x.key.trim(), value: x.value.trim() }))
      : [],
    confidence_notes:
      typeof parsed?.confidence_notes === "string" ? parsed.confidence_notes : undefined,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const webRoot = path.resolve(__dirname, "..");

  await loadDotEnvLocal(webRoot);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "Missing OPENAI_API_KEY. Put it in web/.env.local or set env var before running.",
    );
    process.exit(1);
  }

  const model = process.env.OPENAI_OCR_MODEL ?? "gpt-4o-mini";
  const imagesDir = path.join(webRoot, "public", "section_a_images");
  const cachePath = path.join(webRoot, "src", "data", "section_a_ocr_cache.json");

  const cache = (await readJson(cachePath, {})) ?? {};
  const entries = await fs.readdir(imagesDir);
  const ids = entries
    .map((f) => {
      const m = /^section_a_image_(\d+)\.png$/i.exec(f);
      return m ? Number(m[1]) : null;
    })
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);

  let filtered = ids;
  if (Number.isFinite(args.from)) filtered = filtered.filter((id) => id >= args.from);
  if (Number.isFinite(args.to)) filtered = filtered.filter((id) => id <= args.to);

  const missing = filtered.filter((id) => !cache[String(id)]);
  const totalMissing = missing.length;
  console.log(
    `Found ${ids.length} images. Missing OCR cache entries: ${totalMissing}. Model=${model}.`,
  );
  if (args.dryRun) {
    console.log("Dry run. IDs missing:", missing.join(", "));
    return;
  }

  let done = 0;
  for (const id of missing) {
    done++;
    if (Number.isFinite(args.limit) && done > args.limit) {
      console.log(`Stopping due to --limit ${args.limit}.`);
      break;
    }

    const imgPath = path.join(imagesDir, `section_a_image_${id}.png`);
    console.log(`[${done}/${totalMissing}] OCR id=${id} ...`);

    const buf = await fs.readFile(imgPath);
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

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
      console.error(`OCR failed for id=${id}: ${res.status} ${text}`);
      // continue to next id
      continue;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.error(`Unexpected OCR response for id=${id}`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error(`Non-JSON OCR output for id=${id}`);
      continue;
    }

    cache[String(id)] = normalizeOcr(parsed);
    await atomicWriteJson(cachePath, cache);

    if (args.sleepMs > 0) await sleep(args.sleepMs);
  }

  console.log("Done. Cache written to:", cachePath);
}

await main();


