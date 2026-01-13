// IDのフォールバック設定 (失敗時に試す代替ID)
const ID_ALIASES: Record<string, string> = {
  "polygon-ecosystem-token": "matic-network", // POLで失敗したらMATICを試す
  "matic-network": "polygon-ecosystem-token", // MATICで失敗したらPOLを試す
  "bnb": "binancecoin",
};

// 日付文字列からAPI用の DD-MM-YYYY 形式に変換
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

// ★追加: 待機用関数 (ミリ秒)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchHistoricalPrice = async (coingeckoId: string, dateStr: string): Promise<number | null> => {
  const apiDate = formatDateForApi(dateStr);
  if (!apiDate || !coingeckoId) return null;

  // 単一IDでの取得を試みる内部関数 (リトライロジック付き)
  const tryFetch = async (id: string, retries = 1): Promise<number> => {
    const url = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${apiDate}&localization=false`;
    
    try {
        const res = await fetch(url);
        
        // 429エラー (Rate Limit) の場合
        if (res.status === 429) {
            if (retries > 0) {
                console.warn(`API Rate Limit (429) for ${id}. Retrying in 2s...`);
                await delay(2500); // ★追加: 2.5秒待機してからリトライ
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

  try {
    // 1回目のトライ
    return await tryFetch(coingeckoId);
  } catch (e) {
    // 失敗時、代替IDがあればリトライ
    const alias = ID_ALIASES[coingeckoId];
    if (alias) {
        try {
            console.log(`Retrying historical price for ${coingeckoId} using alias ${alias}...`);
            await delay(1500); // ★追加: エイリアスを試す前にも少し待つ
            return await tryFetch(alias);
        } catch (retryError) {
            console.warn(`Historical price fetch failed for ${alias} (retry):`, retryError);
        }
    } else {
        console.warn(`Historical price fetch failed for ${coingeckoId}:`, e);
    }
    return null;
  }
};