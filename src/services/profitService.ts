import { fetchHistoricalPrice } from './priceService';
import type { TxHistory, TokenData, NetworkConfig } from '../types';

const STABLE_COINS = ['USDC', 'USDT', 'DAI'];

// --- Helper Functions ---

const formatDisplayPrice = (num: number) => {
  if (num === 0) return "0";
  const str = num.toFixed(20).replace(/\.?0+$/, "");
  if (str.length > 12) {
    return str.substring(0, 12) + "..";
  }
  return str;
};

const formatFullNumber = (num: number) => {
  if (num === 0) return "0";
  return num.toFixed(20).replace(/\.?0+$/, "");
};

const formatPercent = (val: number) => {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
};

// --- Types ---

export type ProfitCalculationResult = {
  diffValueMain: string;
  unitProfitPercent: string;
  unitProfitColor: string;
  displayHistUnitPrice: string;
  displayCurrUnitPrice: string;
  totalProfitPercent: string;
  totalProfitColor: string;
  totalDiffUsd: string;
  totalDiffJpy: string;
  totalPrevUsdDisplay: string;
  totalCurrUsdDisplay: string;
  isPrediction?: boolean;
  reason?: string;
};

type ProfitParams = {
  amount: string;
  fromType: 'native' | 'token';
  selectedFromToken: TokenData | null;
  searchedToken: any;
  toInput: string;
  net: NetworkConfig;
  mainNet: NetworkConfig;
  majorTokens: any[];
  currentPrice: { usd: number; jpy: number } | null;
  mainCurrencyPrice: { usd: number; jpy: number } | null;
  txHistory: TxHistory[];
  fetchedFromPrice: number | null;
};

// --- Main Logic ---

export const calculateSwapProfit = async ({
  amount,
  fromType,
  selectedFromToken,
  searchedToken,
  toInput,
  net,
  mainNet,
  majorTokens,
  currentPrice,
  mainCurrencyPrice,
  txHistory,
  fetchedFromPrice
}: ProfitParams): Promise<ProfitCalculationResult | null> => {
  if (!searchedToken) return null;

  const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
  const toSym = searchedToken.symbol;
  
  const inputAmt = parseFloat(amount);

  // --- CoinGecko ID & Native Check ---
  
  // From Token ID
  let fromCoingeckoId: string | null = null;
  if (fromType === 'native') {
    fromCoingeckoId = net.coingeckoId;
  } else if (selectedFromToken) {
    const found = majorTokens.find(t => t.address.toLowerCase() === selectedFromToken.address.toLowerCase());
    if (found && found.coingeckoId) fromCoingeckoId = found.coingeckoId;
  }

  // To Token ID & Native Check
  let toCoingeckoId: string | null = null;
  
  // Native判定: Symbol一致 or アドレス一致 or 特定のWrappedトークン
  const isToNative = searchedToken.symbol === net.symbol || 
                     (net.symbol === 'ETH' && searchedToken.symbol === 'WETH') ||
                     (net.symbol === 'MATIC' && searchedToken.symbol === 'WMATIC') ||
                     (net.symbol === 'POL' && searchedToken.symbol === 'WPOL') ||
                     (net.symbol === 'POL' && searchedToken.symbol === 'MATIC'); // Polygon migration対応

  if (isToNative) {
    toCoingeckoId = net.coingeckoId;
  } else {
    const addrToCheck = searchedToken.address || toInput;
    const found = majorTokens.find(t => t.address.toLowerCase() === addrToCheck.toLowerCase());
    if (found && found.coingeckoId) toCoingeckoId = found.coingeckoId;
  }

  // --- 現在価格の決定 ---

  // From単価 (USD)
  let fromPriceUsd = fetchedFromPrice || 0;
  if (fromPriceUsd === 0) {
    fromPriceUsd = fromType === 'native'
      ? (currentPrice?.usd || 0)
      : (selectedFromToken?.market?.usd.price || 0);
  }

  // To単価 (USD)
  let toPriceUsd = searchedToken.price?.usd || 0;
  
  // ★修正: ToがNativeの場合、API取得価格が0なら currentPrice (Native価格) を使う
  if (isToNative && toPriceUsd === 0 && currentPrice?.usd) {
      toPriceUsd = currentPrice.usd;
  }

  // --- 履歴検索ロジック (逆方向) ---
  const normalize = (s: string) => s.toUpperCase().trim();
  const prevTxReverse = txHistory.find((tx: TxHistory) => {
    if (tx.type !== 'swap') return false;
    if (!tx.symbol.includes('>')) return false;

    const [hFrom, hTo] = tx.symbol.split('>').map(s => normalize(s));
    const currentTo = normalize(toSym);
    const currentFrom = normalize(fromSym);

    // 逆方向チェック
    return hFrom === currentTo && hTo === currentFrom;
  });

  // 初期値
  let unitProfitPercent = "---";
  let unitProfitColor = "text-slate-400";
  let displayHistUnitPrice = "---";

  let totalProfitPercent = "---";
  let totalProfitColor = "text-slate-400";
  let totalDiffUsd = "0";
  let totalDiffJpy = "0";
  let totalPrevUsdDisplay = "0";

  let isPrediction = false;
  let reason = "";

  if (!prevTxReverse) {
      reason = "過去にこのペアの逆方向の取引履歴が見つかりませんでした。";
  } else {
    let histUnitPriceUsd = 0; // 過去の単価

    const isFromStable = STABLE_COINS.some(s => fromSym.toUpperCase().includes(s));
    const isToStable = STABLE_COINS.some(s => toSym.toUpperCase().includes(s));

    // =========================================================
    // 1. 過去の単価(USD)を決定するロジック
    // =========================================================

    if (isFromStable && isToStable) {
      // パターンA: ステーブル同士
      histUnitPriceUsd = 1.0;
      displayHistUnitPrice = "$1.00 (Stable)";
    }
    else if (!isFromStable && fromCoingeckoId) {
      // パターンB: 売り (Crypto -> Stable/Other)
      // 以前買った(Stable->Crypto)
      if (isToStable && prevTxReverse.exchangeRate) {
        histUnitPriceUsd = 1 / prevTxReverse.exchangeRate;
      }
      else {
        isPrediction = true;
        const p = await fetchHistoricalPrice(fromCoingeckoId, prevTxReverse.date);
        if (p && p > 0) {
            histUnitPriceUsd = p;
        } else {
            reason = "過去の価格データをAPIから取得できませんでした。";
        }
      }
    }
    else if (!isToStable) {
      // パターンC: 買い戻し (Stable/Other -> Crypto) 
      // 例: USDC -> MATIC
      
      // 優先1: 履歴データの priceInUsd (過去に売った時のFrom単価)
      if (prevTxReverse.priceInUsd && prevTxReverse.priceInUsd > 0) {
          const p = prevTxReverse.priceInUsd;
          if (toPriceUsd > 0) {
             const diff = (p - toPriceUsd) / toPriceUsd * 100;
             unitProfitPercent = formatPercent(diff);
             unitProfitColor = diff >= 0 ? "text-green-400" : "text-red-400";
             displayHistUnitPrice = `$${formatDisplayPrice(p)} (Sold)`;
             histUnitPriceUsd = -1; // 特殊フラグ
          } else {
             reason = "現在の購入対象(To)の価格が取得できていません。";
          }
      }
      // 優先2: IDがあるならAPI
      else if (toCoingeckoId) {
          isPrediction = true;
          const p = await fetchHistoricalPrice(toCoingeckoId, prevTxReverse.date);
          if (p && p > 0) {
              if (toPriceUsd > 0) {
                 const diff = (p - toPriceUsd) / toPriceUsd * 100;
                 unitProfitPercent = formatPercent(diff);
                 unitProfitColor = diff >= 0 ? "text-green-400" : "text-red-400";
                 displayHistUnitPrice = `$${formatDisplayPrice(p)} (Sold)`;
                 histUnitPriceUsd = -1; 
              } else {
                 reason = "現在の購入対象(To)の価格が取得できていません。";
              }
          } else {
              reason = "過去のToトークン価格をAPIから取得できませんでした。";
          }
      } else {
          reason = "履歴に価格がなく、ToトークンのIDも不明なため計算できません。";
      }
    }
    
    if (histUnitPriceUsd === 0 && prevTxReverse.exchangeRate && isToStable) {
      histUnitPriceUsd = 1 / prevTxReverse.exchangeRate;
    }

    if (histUnitPriceUsd === 0 && unitProfitPercent === "---" && !reason) {
        reason = "履歴データから有効なレートまたは価格を特定できませんでした。";
    }

    // =========================================================
    // 2. 単価比較 (通常フロー: 売りの場合)
    // =========================================================
    if (histUnitPriceUsd > 0 && fromPriceUsd > 0) {
      const diff = (fromPriceUsd - histUnitPriceUsd) / histUnitPriceUsd * 100;
      unitProfitPercent = formatPercent(diff);
      unitProfitColor = diff >= 0 ? "text-green-400" : "text-red-400";
      displayHistUnitPrice = `$${formatDisplayPrice(histUnitPriceUsd)}`;
    } else if (histUnitPriceUsd > 0 && fromPriceUsd === 0) {
        reason = "現在の交換元(From)トークンの価格が取得できません。";
    }

    // =========================================================
    // 3. 総額比較 (Lower Section)
    // =========================================================
    let basePriceForTotal = histUnitPriceUsd;
    if (basePriceForTotal === -1) {
      basePriceForTotal = 1.0; 
    }

    if (basePriceForTotal > 0 && fromPriceUsd > 0) {
      const totalPrevUsd = inputAmt * basePriceForTotal;
      const totalCurrUsd = inputAmt * fromPriceUsd;

      const totalDiffVal = totalCurrUsd - totalPrevUsd;
      let totalDiffPerc = 0;
      if (totalPrevUsd > 0) totalDiffPerc = (totalDiffVal / totalPrevUsd) * 100;

      totalProfitPercent = formatPercent(totalDiffPerc);
      totalProfitColor = totalDiffVal >= 0 ? "text-green-400" : "text-red-400";

      totalDiffUsd = (totalDiffVal >= 0 ? "+" : "") + formatFullNumber(totalDiffVal);

      // JPY換算
      const usdJpyRate = (currentPrice?.usd && currentPrice?.jpy) ? (currentPrice.jpy / currentPrice.usd) : 150;
      const totalDiffValJpy = totalDiffVal * usdJpyRate;
      totalDiffJpy = (totalDiffValJpy >= 0 ? "+" : "") + formatFullNumber(totalDiffValJpy);

      totalPrevUsdDisplay = formatFullNumber(totalPrevUsd);
    }
  }

  // 基礎通貨換算
  const currentValueUsd = inputAmt * fromPriceUsd;
  let diffValueMainStr = "---";
  if (mainCurrencyPrice?.usd && mainCurrencyPrice.usd > 0) {
    const valInMain = currentValueUsd / mainCurrencyPrice.usd;
    diffValueMainStr = `${formatFullNumber(valInMain)} ${mainNet.symbol}`;
  }

  const currentTotalUsdDisplay = formatFullNumber(currentValueUsd);

  return {
    diffValueMain: diffValueMainStr,
    unitProfitPercent,
    unitProfitColor,
    displayHistUnitPrice,
    displayCurrUnitPrice: `$${formatDisplayPrice(fromPriceUsd)}`, 
    totalProfitPercent,
    totalProfitColor,
    totalDiffUsd,
    totalDiffJpy,
    totalPrevUsdDisplay, 
    totalCurrUsdDisplay: currentTotalUsdDisplay, 
    isPrediction,
    reason 
  };
};