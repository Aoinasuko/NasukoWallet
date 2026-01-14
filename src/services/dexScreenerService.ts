// src/services/dexScreenerService.ts
// Lightweight price fetcher using DexScreener public API.
// NOTE: This is best-effort and should be cached to avoid rate limits.

export type DexChainId =
  | 'ethereum'
  | 'polygon'
  | 'optimism'
  | 'arbitrum'
  | 'base'
  | 'bsc'
  | 'avalanche';

// Map internal networkKey to DexScreener chainId
export const DEX_CHAIN_ID: Record<string, DexChainId> = {
  mainnet: 'ethereum',
  ethereum: 'ethereum',
  polygon: 'polygon',
  optimism: 'optimism',
  arbitrum: 'arbitrum',
  base: 'base',
  bsc: 'bsc',
  avalanche: 'avalanche',
};

type DexPair = {
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
};

type DexTokenResp = {
  pairs?: DexPair[];
};

const DEX_BASE = 'https://api.dexscreener.com/latest/dex';

export async function fetchDexScreenerTokenPriceUsd(params: {
  networkKey: string;
  tokenAddress: string;
  timeoutMs?: number;
}): Promise<number | null> {
  const { networkKey, tokenAddress, timeoutMs = 12000 } = params;
  const chainId = DEX_CHAIN_ID[networkKey];
  if (!chainId) return null;

  const addr = tokenAddress.toLowerCase();
  // DexScreener expects checksummed/0x.. but accepts lowercase.
  const url = `${DEX_BASE}/tokens/${addr}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`DexScreener HTTP ${res.status}`);
    }
    const data = (await res.json()) as DexTokenResp;
    const pairs = (data.pairs ?? []).filter(p => (p.chainId ?? '').toLowerCase() === chainId);

    let best: DexPair | null = null;
    let bestLiq = -1;
    for (const p of pairs) {
      const px = p.priceUsd ? Number(p.priceUsd) : NaN;
      if (!Number.isFinite(px) || px <= 0) continue;
      const liq = Number(p.liquidity?.usd ?? 0);
      if (liq > bestLiq) {
        best = p;
        bestLiq = liq;
      }
    }
    if (!best?.priceUsd) return null;
    const v = Number(best.priceUsd);
    return Number.isFinite(v) ? v : null;
  } finally {
    clearTimeout(t);
  }
}

export type DexTokenStats = {
  priceUsd: number | null;
  liquidityUsd: number;
  volumeH24Usd: number;
};

// Return best (highest liquidity) pair stats on the specified chain.
export async function fetchDexScreenerTokenStats(params: {
  networkKey: string;
  tokenAddress: string;
  timeoutMs?: number;
}): Promise<DexTokenStats | null> {
  const { networkKey, tokenAddress, timeoutMs = 12000 } = params;
  const chainId = DEX_CHAIN_ID[networkKey];
  if (!chainId) return null;
  const addr = tokenAddress.toLowerCase();
  const url = `${DEX_BASE}/tokens/${addr}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as DexTokenResp;
    const pairs = (data.pairs ?? []).filter(p => (p.chainId ?? '').toLowerCase() === chainId);
    let best: DexPair | null = null;
    let bestLiq = -1;
    for (const p of pairs) {
      const px = p.priceUsd ? Number(p.priceUsd) : NaN;
      if (!Number.isFinite(px) || px <= 0) continue;
      const liq = Number(p.liquidity?.usd ?? 0);
      if (liq > bestLiq) {
        best = p;
        bestLiq = liq;
      }
    }
    if (!best) return null;
    const priceUsd = best.priceUsd ? Number(best.priceUsd) : null;
    const liquidityUsd = Number(best.liquidity?.usd ?? 0) || 0;
    const volumeH24Usd = Number(best.volume?.h24 ?? 0) || 0;
    return {
      priceUsd: Number.isFinite(priceUsd as number) ? (priceUsd as number) : null,
      liquidityUsd,
      volumeH24Usd,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}


export async function getTokenMaxLiquidityUsd(networkKey: string, tokenAddress: string): Promise<number | null> {
  const chainId = DEX_CHAIN_ID[networkKey] as DexChainId | undefined;
  if (!chainId) return null;
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
    let best = 0;
    for (const p of pairs) {
      if (!p || p.chainId !== chainId) continue;
      const liq = Number(p.liquidity?.usd ?? 0);
      if (Number.isFinite(liq) && liq > best) best = liq;
    }
    return best > 0 ? best : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
