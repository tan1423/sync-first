import mongoose from "mongoose";

// Cache the connection across hot-reloads (dev) and serverless invocations so we
// don't open a new pool on every request.
const globalForMongoose = globalThis as unknown as {
  _mongoose?: Promise<typeof mongoose>;
};

export function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is not set");

  if (!globalForMongoose._mongoose) {
    mongoose.set("strictQuery", true);
    globalForMongoose._mongoose = mongoose.connect(uri, {
      // Fail fast if the DB is unreachable instead of hanging the request.
      serverSelectionTimeoutMS: 8000,
    });
  }
  return globalForMongoose._mongoose;
}
