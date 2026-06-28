import { createClient } from "redis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = createClient({ url });

redis.on("error", (err) => console.error("[redis] error:", err));

let connected = false;

export async function ensureRedis() {
  if (connected) return;
  await redis.connect();
  connected = true;
  console.log("[redis] connected:", url);
}
