import { getMongoClient } from "@/lib/mongodb";
import type { ExamResultDocument } from "@/lib/models/ExamResult";

const DB_NAME = process.env.MONGODB_DB_NAME || "tef-simulator";
const RESULTS_COLLECTION = "exam_results";

export async function getResultsCollection() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection<ExamResultDocument>(RESULTS_COLLECTION);
}


