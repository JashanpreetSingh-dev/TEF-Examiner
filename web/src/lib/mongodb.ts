import { MongoClient, ServerApiVersion } from "mongodb";

const uriEnv = process.env.MONGODB_URI;

if (!uriEnv) {
  // We throw here so that server-side code fails fast if MongoDB is not configured.
  throw new Error("MONGODB_URI is not set in the environment.");
}

// TypeScript now knows uri is definitely a string after the throw check
const uri: string = uriEnv;

const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export function getMongoClient(): Promise<MongoClient> {
  if (!clientPromise) {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
  return clientPromise;
}


