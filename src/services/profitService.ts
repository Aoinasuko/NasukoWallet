// src/services/profitService.ts

import { fetchHistoricalPrice } from './priceService';
import type { TxHistory, TokenData, NetworkConfig } from '../types';

const STABLE_COINS = ['USDC', 'USDT', 'DAI'];

// --- Helper Functions ---

// 数値を表示用にフォーマット (10桁程度で切り捨て)
const formatDisplayPrice = (num: number) => {
  if (num === 0) return "0";
  const str = num.toFixed(18).replace(/\.?0+$/, "");
  if (str.length > 10) {
    return str.substring(0, 10) + "..";
  }
  return str;
};

// 全桁表示用
const formatFullNumber = (num: number) => {
  if (num === 0) return "0";
  return num.toFixed(20).replace(/\.?0+$/, "");
};

// パーセント表示
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

  // 現在の単価 (USD)
  let fromPriceUsd = fetchedFromPrice || 0;
  if (fromPriceUsd === 0) {
    fromPriceUsd = fromType === 'native'
      ? (currentPrice?.usd || 0)
      : (selectedFromToken?.market?.usd.price || 0);
  }
  const toPriceUsd = searchedToken.price?.usd || 0;

  // CoinGecko IDの特定
  let fromCoingeckoId: string | null = null;
  if (fromType === 'native') {
    fromCoingeckoId = net.coingeckoId;
  } else if (selectedFromToken) {
    const found = majorTokens.find(t => t.address.toLowerCase() === selectedFromToken.address.toLowerCase());
    if (found && found.coingeckoId) fromCoingeckoId = found.coingeckoId;
  }

  let toCoingeckoId: string | null = null;
  if (searchedToken.symbol === net.symbol || searchedToken.symbol === `W${net.symbol}`) {
    toCoingeckoId = net.coingeckoId;
  } else {
    // searchedToken自体のアドレスか、入力されたアドレスで検索
    const addrToCheck = searchedToken.address || toInput;
    const found = majorTokens.find(t => t.address.toLowerCase() === addrToCheck.toLowerCase());
    if (found && found.coingeckoId) toCoingeckoId = found.coingeckoId;
  }

  // 履歴検索ロジック (逆方向: Profit/Lossチェック用)
  const normalize = (s: string) => s.toUpperCase().trim();
  const prevTxReverse = txHistory.find((tx: TxHistory) => {
    if (tx.type !== 'swap') return false;
    if (!tx.symbol.includes('>')) return false;

    const [hFrom, hTo] = tx.symbol.split('>').map(s => normalize(s));
    const currentTo = normalize(toSym);
    const currentFrom = normalize(fromSym);

    // 逆方向チェック: 履歴のFromが今回のTo、履歴のToが今回のFrom
    return hFrom === currentTo && hTo === currentFrom;
  });

  // 初期値設定
  let unitProfitPercent = "---";
  let unitProfitColor = "text-slate-400";
  let displayHistUnitPrice = "---";

  let totalProfitPercent = "---";
  let totalProfitColor = "text-slate-400";
  let totalDiffUsd = "0";
  let totalDiffJpy = "0";
  let totalPrevUsdDisplay = "0";

  let isPrediction = false;

  if (prevTxReverse) {
    let histUnitPriceUsd = 0;

    const isFromStable = STABLE_COINS.some(s => fromSym.toUpperCase().includes(s));
    const isToStable = STABLE_COINS.some(s => toSym.toUpperCase().includes(s));

    // ---------------------------------------------------------
    // 1. 過去の単価(USD)を決定するロジック
    // ---------------------------------------------------------

    if (isFromStable && isToStable) {
      // パターンA: ステーブル同士 (USDC <-> USDT)
      histUnitPriceUsd = 1.0;
      displayHistUnitPrice = "$1.00 (Stable)";
    }
    else if (!isFromStable && fromCoingeckoId) {
      // パターンB: 売り (Crypto -> Stable/Other)
      // 以前買った履歴(Stable->Crypto)があるはず
      
      // A. レートから逆算 (最も正確な取得単価)
      // 履歴: Stable -> Crypto. Rate = Crypto/Stable. Cost = 1/Rate.
      if (isToStable && prevTxReverse.exchangeRate) {
        histUnitPriceUsd = 1 / prevTxReverse.exchangeRate;
      }
      // B. APIから取得 (レートがない場合)
      else {
        isPrediction = true;
        const p = await fetchHistoricalPrice(fromCoingeckoId, prevTxReverse.date);
        if (p && p > 0) histUnitPriceUsd = p;
      }
    }
    else if (!isToStable && toCoingeckoId) {
      // パターンC: 買い戻し (Stable/Other -> Crypto)
      // 以前売った履歴(Crypto->Stable)があるはず
      
      isPrediction = true;
      const p = await fetchHistoricalPrice(toCoingeckoId, prevTxReverse.date);
      if (p && p > 0) {
        // 特殊計算: (売値 - 買値) / 買値
        if (toPriceUsd > 0) {
          const diff = (p - toPriceUsd) / toPriceUsd * 100;
          unitProfitPercent = formatPercent(diff);
          unitProfitColor = diff >= 0 ? "text-green-400" : "text-red-400";
          displayHistUnitPrice = `$${formatDisplayPrice(p)} (Sold)`;
          histUnitPriceUsd = -1; // 特殊フラグ(下の共通計算をスキップ)
        }
      }
    }
    else if (prevTxReverse.exchangeRate && isToStable) {
      // バックアップ: IDなしでも相手がStableならレートから推測
      histUnitPriceUsd = 1 / prevTxReverse.exchangeRate;
    }

    // ---------------------------------------------------------
    // 2. 単価比較 (通常フロー: 売りの場合)
    // ---------------------------------------------------------
    if (histUnitPriceUsd > 0 && fromPriceUsd > 0) {
      const diff = (fromPriceUsd - histUnitPriceUsd) / histUnitPriceUsd * 100;
      unitProfitPercent = formatPercent(diff);
      unitProfitColor = diff >= 0 ? "text-green-400" : "text-red-400";
      displayHistUnitPrice = `$${formatDisplayPrice(histUnitPriceUsd)}`;
    }

    // ---------------------------------------------------------
    // 3. 総額比較 (Lower Section)
    // ---------------------------------------------------------
    let basePriceForTotal = histUnitPriceUsd;
    if (basePriceForTotal === -1) {
      // 買い戻し(Pattern C)の総額比較: From(USDC等)の価値は変わらない($1)
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
    totalCurrUsdDisplay: formatFullNumber(currentValueUsd),
    isPrediction
  };
};