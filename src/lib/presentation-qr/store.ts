import {createClient, type RedisClientType} from "redis";
import type {PresentationMediaKind} from "./token";
import {generatePresentationCode, isValidPresentationCode} from "./code";

export type PresentationCodeRecord = {
  uid: number;
  kind: PresentationMediaKind;
  mid: string;
};

const REDIS_KEY_PREFIX = "presentation:qr:";

type MemoryEntry = {record: PresentationCodeRecord; expiresAt: number};

const memoryStore = new Map<string, MemoryEntry>();

let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<RedisClientType | null> | null = null;

function pruneMemoryStore(now = Date.now()) {
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }
}

async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (redisClient?.isOpen) return redisClient;
  if (redisConnectPromise) return redisConnectPromise;

  redisConnectPromise = (async () => {
    const client = createClient({url});
    client.on("error", (error) => {
      console.error("[presentation-qr/store] Redis error:", error);
    });
    await client.connect();
    redisClient = client as RedisClientType;
    return redisClient;
  })();

  try {
    return await redisConnectPromise;
  } catch (error) {
    console.error("[presentation-qr/store] Redis connect failed, using in-memory fallback:", error);
    redisConnectPromise = null;
    redisClient = null;
    return null;
  }
}

function saveToMemory(code: string, record: PresentationCodeRecord, ttlSeconds: number): boolean {
  pruneMemoryStore();
  if (memoryStore.has(code)) return false;
  memoryStore.set(code, {
    record,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return true;
}

function lookupFromMemory(code: string): PresentationCodeRecord | null {
  pruneMemoryStore();
  const entry = memoryStore.get(code);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryStore.delete(code);
    return null;
  }
  return entry.record;
}

/** @internal Test helper */
export function resetPresentationStoreForTests() {
  memoryStore.clear();
  redisClient = null;
  redisConnectPromise = null;
}

export async function savePresentationCodeIfAbsent(
  code: string,
  record: PresentationCodeRecord,
  ttlSeconds: number,
): Promise<boolean> {
  if (!isValidPresentationCode(code)) return false;

  const redis = await getRedisClient();
  if (redis) {
    const key = `${REDIS_KEY_PREFIX}${code}`;
    const result = await redis.set(key, JSON.stringify(record), {EX: ttlSeconds, NX: true});
    return result === "OK";
  }

  return saveToMemory(code, record, ttlSeconds);
}

export async function lookupPresentationCode(code: string): Promise<PresentationCodeRecord | null> {
  if (!isValidPresentationCode(code)) return null;

  const redis = await getRedisClient();
  if (redis) {
    const raw = await redis.get(`${REDIS_KEY_PREFIX}${code}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PresentationCodeRecord;
    } catch {
      return null;
    }
  }

  return lookupFromMemory(code);
}

const MAX_MINT_ATTEMPTS = 8;

export async function mintUniquePresentationCode(
  record: PresentationCodeRecord,
  ttlSeconds: number,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const code = generatePresentationCode();
    const saved = await savePresentationCodeIfAbsent(code, record, ttlSeconds);
    if (saved) return code;
  }
  throw new Error("Failed to mint unique presentation code");
}
