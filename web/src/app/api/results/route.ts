import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getResultsCollection } from "@/lib/db";
import type { ExamResultDocument } from "@/lib/models/ExamResult";

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ExamResultDocument;
  try {
    body = (await req.json()) as ExamResultDocument;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const doc: ExamResultDocument = {
    ...body,
    userId,
    createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    endedAt: new Date(body.endedAt),
  };

  const collection = await getResultsCollection();
  await collection.updateOne(
    { userId, sessionId: doc.sessionId },
    { $set: doc },
    { upsert: true },
  );

  return NextResponse.json({ sessionId: doc.sessionId });
}

export async function GET(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const collection = await getResultsCollection();
  const doc = await collection.findOne({ userId, sessionId });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(doc);
}


