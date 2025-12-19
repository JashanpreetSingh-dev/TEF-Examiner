import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ResultsClient } from "./results-client";

export default async function ResultsPage(props: {
  params: Promise<{ section?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Require authentication to view results
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const { section } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};

  const sidRaw = searchParams["sid"];
  const sid = typeof sidRaw === "string" ? sidRaw : Array.isArray(sidRaw) ? sidRaw[0] : undefined;

  // Keep this route permissive; ResultsClient will handle missing/invalid data gracefully.
  const sectionParam = typeof section === "string" ? section.toLowerCase() : "a";

  return <ResultsClient sectionParam={sectionParam} sid={sid} />;
}


