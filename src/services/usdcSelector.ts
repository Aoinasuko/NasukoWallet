// src/services/usdcSelector.ts
import { getTokenMaxLiquidityUsd } from './dexScreenerService';
import { UNISWAP_ADDRESSES } from '../constants';

type Cached = { value: string; expiresAt: number };
const cache = new Map<string, Cached>();
const TTL_MS = 10 * 60_000; // 10 minutes

/**
 * For chains that have multiple USDC representations (e.g., Polygon: native USDC vs USDC.e),
 * choose the one with the highest DexScreener liquidity (best effort).
 */
export async function resolveBestUsdcAddress(networkKey: string): Promise<string | null> {
  const now = Date.now();
  const c = cache.get(networkKey);
  if (c && c.expiresAt > now) return c.value;

  const addr = UNISWAP_ADDRESSES[networkKey];
  if (!addr?.USDC) return null;

  // Currently only Polygon needs this, but keep it generic.
  const candidates: string[] = [];
  // Preferred: explicitly provided candidates
  const anyAddr: any = addr as any;
  if (anyAddr.USDC_NATIVE) candidates.push(anyAddr.USDC_NATIVE);
  if (anyAddr.USDC_E) candidates.push(anyAddr.USDC_E);
  // Fallback: current USDC value
  candidates.push(addr.USDC);

  // Deduplicate
  const uniq = Array.from(new Set(candidates.map(a => a.toLowerCase())));

  if (uniq.length === 1) {
    const v = candidates[0];
    cache.set(networkKey, { value: v, expiresAt: now + TTL_MS });
    return v;
  }

  let bestAddr: string | null = null;
  let bestLiq = -1;

  for (const aLower of uniq) {
    const original = candidates.find(x => x.toLowerCase() == aLower) || aLower;
    const liq = await getTokenMaxLiquidityUsd(networkKey, original);
    if (liq != null && liq > bestLiq) {
      bestLiq = liq;
      bestAddr = original;
    }
  }

  // If DexScreener fails for all, keep current USDC.
  const chosen = bestAddr ?? addr.USDC;
  cache.set(networkKey, { value: chosen, expiresAt: now + TTL_MS });
  return chosen;
}
