// src/services/priceService.ts

import type { StorageLocal } from '../types';

const ID_ALIASES: Record<string, string> = {
  "polygon-ecosystem-token": "matic-network", 
  "matic-network": "polygon-ecosystem-token", 
  "bnb": "binancecoin",
};

const formatDateForApi = (dateStr: string): string | null => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  } catch {
    return null;
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchCurrentPrice = async (coingeckoId: string): Promise<{ usd: number; jpy: number; usdChange: number; jpyChange: number } | null> => {
  if (!coingeckoId) return null;

  const tryFetch = async (id: string, retries = 1): Promise<any> => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,jpy&include_24hr_change=true`;
    try {
        const res = await fetch(url);
        if (res.status === 429) {
            if (retries > 0) {
                await delay(2500); 
                return tryFetch(id, retries - 1);
            }
            throw new Error(`Rate Limit (429)`);
        }
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return await res.json();
    } catch (e) { throw e; }
  };

  try {
    let data = await tryFetch(coingeckoId);
    let result = data[coingeckoId];
    
    if (!result && ID_ALIASES[coingeckoId]) {
        const alias = ID_ALIASES[coingeckoId];
        await delay(1000);
        data = await tryFetch(alias);
        result = data[alias];
    }

    if (result) {
        return {
            usd: result.usd,
            jpy: result.jpy,
            usdChange: result.usd_24h_change || 0,
            jpyChange: result.jpy_24h_change || 0
        };
    }
  } catch (e) {
    console.warn(`Fetch current price failed for ${coingeckoId}:`, e);
  }
  return null;
};

export const fetchHistoricalPrice = async (coingeckoId: string, dateStr: string): Promise<number | null> => {
  const apiDate = formatDateForApi(dateStr);
  if (!apiDate || !coingeckoId) return null;

  const cacheKey = `${coingeckoId}_${apiDate}`;

  try {
    const local = await chrome.storage.local.get(['priceCache']) as StorageLocal;
    if (local.priceCache && local.priceCache[cacheKey]) {
      console.log(`[PriceService] Cache hit for ${cacheKey}`);
      return local.priceCache[cacheKey].price;
    }
  } catch (e) {
    console.warn("Failed to load price cache", e);
  }

  const tryFetch = async (id: string, retries = 1): Promise<number> => {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${apiDate}&localization=false`;
    try {
        const res = await fetch(url);
        if (res.status === 429) {
            if (retries > 0) {
                await delay(2500); 
                return tryFetch(id, retries - 1);
            }
            throw new Error(`API Rate Limit Exceeded (429)`);
        }
        if (!res.ok) {
            throw new Error(`API Error: ${res.status}`);
        }
        const data = await res.json();
        if (!data || !data.market_data || !data.market_data.current_price || !data.market_data.current_price.usd) {
            throw new Error("No price data found");
        }
        return data.market_data.current_price.usd;
    } catch (e) { throw e; }
  };

  let price: number | null = null;
  try {
    price = await tryFetch(coingeckoId);
  } catch (e) {
    const alias = ID_ALIASES[coingeckoId];
    if (alias) {
        try {
            await delay(1500);
            price = await tryFetch(alias);
        } catch (retryError) {
            console.warn(`Fetch failed for alias ${alias}:`, retryError);
        }
    } else {
        console.warn(`Fetch failed for ${coingeckoId}:`, e);
    }
  }

  if (price !== null) {
    try {
      const local = await chrome.storage.local.get(['priceCache']) as StorageLocal;
      const cache = local.priceCache || {};
      const keys = Object.keys(cache);
      if (keys.length >= 20) {
        const oldestKey = keys.reduce((a, b) => cache[a].timestamp < cache[b].timestamp ? a : b);
        delete cache[oldestKey];
      }
      cache[cacheKey] = { price: price, timestamp: Date.now() };
      await chrome.storage.local.set({ priceCache: cache });
    } catch (e) {
      console.warn("Failed to save price cache", e);
    }
  }

  return price;
};