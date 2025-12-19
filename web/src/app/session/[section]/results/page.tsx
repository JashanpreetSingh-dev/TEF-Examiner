import { ResultsClient } from "./results-client";

export default async function ResultsPage(props: {
  params: Promise<{ section?: string }> | { section?: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const { section } = await Promise.resolve(props.params);
  const searchParams = await Promise.resolve(props.searchParams ?? {});

  const sidRaw = searchParams["sid"];
  const sid = typeof sidRaw === "string" ? sidRaw : Array.isArray(sidRaw) ? sidRaw[0] : undefined;

  // Keep this route permissive; ResultsClient will handle missing/invalid data gracefully.
  const sectionParam = typeof section === "string" ? section.toLowerCase() : "a";

  return <ResultsClient sectionParam={sectionParam} sid={sid} />;
}


