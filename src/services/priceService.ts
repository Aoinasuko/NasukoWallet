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

export const fetchHistoricalPrice = async (coingeckoId: string, dateStr: string): Promise<number | null> => {
  const apiDate = formatDateForApi(dateStr);
  if (!apiDate || !coingeckoId) return null;

  // キャッシュのキーを作成 (例: bitcoin_01-01-2024)
  const cacheKey = `${coingeckoId}_${apiDate}`;

  // 1. キャッシュ確認 (高速化)
  try {
    const local = await chrome.storage.local.get(['priceCache']) as StorageLocal;
    if (local.priceCache && local.priceCache[cacheKey]) {
      console.log(`[PriceService] Cache hit for ${cacheKey}`);
      return local.priceCache[cacheKey].price;
    }
  } catch (e) {
    console.warn("Failed to load price cache", e);
  }

  // --- 内部関数: API取得ロジック ---
  const tryFetch = async (id: string, retries = 1): Promise<number> => {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${apiDate}&localization=false`;

    try {
        const res = await fetch(url);

        if (res.status === 429) {
            if (retries > 0) {
                console.warn(`API Rate Limit (429) for ${id}. Retrying in 2.5s...`);
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
    } catch (e) {
        throw e;
    }
  };

  // 2. APIから取得
  let price: number | null = null;
  try {
    price = await tryFetch(coingeckoId);
  } catch (e) {
    const alias = ID_ALIASES[coingeckoId];
    if (alias) {
        try {
            console.log(`Retrying with alias ${alias}...`);
            await delay(1500);
            price = await tryFetch(alias);
        } catch (retryError) {
            console.warn(`Fetch failed for alias ${alias}:`, retryError);
        }
    } else {
        console.warn(`Fetch failed for ${coingeckoId}:`, e);
    }
  }

  // 3. 取得できた場合、キャッシュに保存
  if (price !== null) {
    try {
      const local = await chrome.storage.local.get(['priceCache']) as StorageLocal;
      const cache = local.priceCache || {};

      // キャッシュサイズ制限 (最新20件程度を保持)
      const keys = Object.keys(cache);
      if (keys.length >= 20) {
        // 一番古いデータを削除
        const oldestKey = keys.reduce((a, b) => cache[a].timestamp < cache[b].timestamp ? a : b);
        delete cache[oldestKey];
      }

      // 新しいデータを保存
      cache[cacheKey] = { price: price, timestamp: Date.now() };
      await chrome.storage.local.set({ priceCache: cache });
      console.log(`[PriceService] Saved cache for ${cacheKey}`);
    } catch (e) {
      console.warn("Failed to save price cache", e);
    }
  }

  return price;
};