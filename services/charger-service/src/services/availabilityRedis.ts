import { ensureRedis, redis } from "../redis/client.ts";
import { rkeys } from "../redis/keys.ts";
import { LUA_RESERVE } from "../redis/scripts.ts";

export type ApiChargerStatus = "available" | "in_use" | "outage";

type ReserveResult =
  | { ok: true; expiresAtMs: number }
  | {
      ok: false;
      reason:
        | "USER_ALREADY_HAS_RESERVATION"
        | "CHARGER_ALREADY_RESERVED"
        | "REDIS_ERROR";
    };

export async function reserveAtomic(args: {
  userId: number;
  chargerId: number;
  ttlMs: number;
}): Promise<ReserveResult> {
  await ensureRedis();
  const nowMs = Date.now();

  try {
    const resp = (await redis.eval(LUA_RESERVE, {
      keys: [
        rkeys.chargerReservation(args.chargerId),
        rkeys.userReservation(args.userId),
        rkeys.chargerStatus(args.chargerId),
      ],
      arguments: [
        String(args.userId),
        String(args.chargerId),
        String(args.ttlMs),
        String(nowMs),
      ],
    })) as any;

    if (Array.isArray(resp) && resp[0] === "OK") {
      return { ok: true, expiresAtMs: Number(resp[1]) };
    }
    return { ok: false, reason: "REDIS_ERROR" };
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("USER_ALREADY_HAS_RESERVATION"))
      return { ok: false, reason: "USER_ALREADY_HAS_RESERVATION" };
    if (msg.includes("CHARGER_ALREADY_RESERVED"))
      return { ok: false, reason: "CHARGER_ALREADY_RESERVED" };

    console.error("[reserveAtomic] error:", e);
    return { ok: false, reason: "REDIS_ERROR" };
  }
}

export async function cancelReservationRedis(args: {
  userId: number;
  chargerId: number;
}) {
  await ensureRedis();
  const multi = redis.multi();

  multi.del(rkeys.chargerReservation(args.chargerId));
  multi.del(rkeys.userReservation(args.userId));
  multi.set(rkeys.chargerStatus(args.chargerId), "available");

  await multi.exec();
}

export async function setChargerStatusRedis(
  chargerId: number,
  status: ApiChargerStatus,
  ttlMs?: number
) {
  await ensureRedis();
  if (ttlMs && ttlMs > 0) {
    await redis.set(rkeys.chargerStatus(chargerId), status, { PX: ttlMs });
  } else {
    await redis.set(rkeys.chargerStatus(chargerId), status);
  }
}

export async function getStatusOverlay(chargerIds: number[]) {
  await ensureRedis();
  const keys = chargerIds.map((id) => rkeys.chargerStatus(id));
  const values = await redis.mGet(keys);

  const out = new Map<number, ApiChargerStatus>();
  for (let i = 0; i < chargerIds.length; i++) {
    const v = values[i] as ApiChargerStatus | null;
    if (v === "available" || v === "in_use" || v === "outage") {
      out.set(chargerIds[i], v);
    }
  }
  return out;
}

export async function getUserReservedChargerId(userId: number): Promise<number | null> {
  await ensureRedis();
  const v = await redis.get(rkeys.userReservation(userId));
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
