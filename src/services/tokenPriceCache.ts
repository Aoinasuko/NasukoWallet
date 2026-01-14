// src/services/tokenPriceCache.ts
import { fetchDexScreenerTokenPriceUsd } from './dexScreenerService';

type CacheEntry = { value: number | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<number | null>>();

const DEFAULT_TTL_MS = 60_000;
const ERROR_TTL_MS = 10_000;

function key(networkKey: string, tokenAddress: string) {
  return `${networkKey}:${tokenAddress.toLowerCase()}`;
}

export async function getTokenPriceUsdCached(params: {
  networkKey: string;
  tokenAddress: string;
  ttlMs?: number;
}): Promise<number | null> {
  const k = key(params.networkKey, params.tokenAddress);
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && hit.expiresAt > now) return hit.value;

  const inF = inflight.get(k);
  if (inF) return inF;

  const p = (async () => {
    try {
      const v = await fetchDexScreenerTokenPriceUsd({
        networkKey: params.networkKey,
        tokenAddress: params.tokenAddress,
      });
      cache.set(k, { value: v, expiresAt: now + (params.ttlMs ?? DEFAULT_TTL_MS) });
      return v;
    } catch (e) {
      // avoid hot-looping errors
      cache.set(k, { value: null, expiresAt: now + ERROR_TTL_MS });
      throw e;
    } finally {
      inflight.delete(k);
    }
  })();

  inflight.set(k, p);
  return p;
}
