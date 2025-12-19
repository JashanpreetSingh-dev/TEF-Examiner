import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getResultsCollection } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collection = await getResultsCollection();

  const docs = await collection
    .find({ userId })
    .project({
      _id: 0,
      userId: 0,
      finalTranscript: 0,
      finalTranscriptForEval: 0,
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  return NextResponse.json({ results: docs });
}


