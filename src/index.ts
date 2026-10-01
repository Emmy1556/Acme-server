import { app } from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { connectRedis, kv } from "./config/redis";
import mongoose from "mongoose";

async function main() {
  await connectDB();
  await connectRedis(); // falls back to memory in development, throws in production

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 API running on http://localhost:${env.PORT}/api`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close();
    await Promise.allSettled([mongoose.disconnect(), kv.close()]);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
