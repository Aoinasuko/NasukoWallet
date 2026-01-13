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

// --- Main Logic ---


export const calculateSwapProfit = async ({
  amount,
  fromType,
  selectedFromToken,
  searchedToken,
  toInput: _toInput,
  net,
  mainNet,
  majorTokens,
  currentPrice,
  mainCurrencyPrice,
  txHistory,
  fetchedFromPrice,
  // ★改善: クォート(見積)の受取数量を渡せるようにする（総額損益を受取量ベースで計算）
  expectedReceivedAmount
}: ProfitParams & { expectedReceivedAmount?: string | null }): Promise<ProfitCalculationResult> => {
  if (!searchedToken) return null as any;

  const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
  const toSym = searchedToken.symbol;

  const inputAmt = parseFloat(amount);
  if (!isFinite(inputAmt) || inputAmt <= 0) {
    return {
      diffValueMain: "---",
      unitProfitPercent: "---",
      unitProfitColor: "text-slate-400",
      displayHistUnitPrice: "---",
      displayCurrUnitPrice: "---",
      totalProfitPercent: "---",
      totalProfitColor: "text-slate-400",
      totalDiffUsd: "---",
      totalDiffJpy: "---",
      totalPrevUsdDisplay: "---",
      totalCurrUsdDisplay: "---",
      isPrediction: true,
      reason: "金額が未入力です。"
    };
  }

  const expectedOutAmt = expectedReceivedAmount ? parseFloat(expectedReceivedAmount) : NaN;

  const isFromStable = STABLE_COINS.includes(fromSym);
  const isToStable = STABLE_COINS.includes(toSym);

  // 現在価格(USD)
  const currentFromPriceUsd =
    fromType === 'native' ? (currentPrice?.usd || 0) : (fetchedFromPrice || selectedFromToken?.market?.usd.price || 0);

  const currentToPriceUsd =
    searchedToken?.market?.usd?.price || searchedToken?.market?.usdPrice || 0;

  // Swapシンボル解析
  const parseSwapSymbol = (s: string): { from: string; to: string } => {
    const parts = s.split('>').map((x: string) => x.trim());
    if (parts.length === 2) return { from: parts[0], to: parts[1] };
    return { from: s.trim(), to: "" };
  };

  // 直近の「逆方向」のswapを探す
  const reversed = [...txHistory].reverse().filter(tx => tx.type === 'swap');
  const prevTx = reversed.find(tx => {
    const p = parseSwapSymbol(tx.symbol);
    return p.from === toSym && p.to === fromSym;
  }) || null;

  // 今回: Stable->Crypto を「買い戻し」とみなす（過去の売り単価と比較）
  const isBuyback = isFromStable && !isToStable;
  const relevantSymForHist = isBuyback ? toSym : fromSym;

  // 過去単価(USD)を履歴から取得（priceBasisを優先）
  const getHistUnitPriceUsd = async (): Promise<{ price: number; isPrediction: boolean; reason?: string }> => {
    if (!prevTx) return { price: 0, isPrediction: true, reason: "比較対象となる過去のスワップ履歴が見つかりませんでした。" };

    if (prevTx.priceBasisSymbol && prevTx.priceInUsd && prevTx.priceBasisSymbol === relevantSymForHist) {
      return { price: prevTx.priceInUsd, isPrediction: false };
    }
    if (relevantSymForHist === fromSym && prevTx.priceInUsdFrom) return { price: prevTx.priceInUsdFrom, isPrediction: false };
    if (relevantSymForHist === toSym && prevTx.priceInUsdTo) return { price: prevTx.priceInUsdTo, isPrediction: false };

    // fallback: CoinGecko推定（IDが取れる場合のみ）
    let coingeckoId: string | null = null;
    if (relevantSymForHist === net.symbol) {
      coingeckoId = net.coingeckoId;
    } else {
      const found = majorTokens?.find((t: any) => t.symbol === relevantSymForHist && t.coingeckoId);
      if (found?.coingeckoId) coingeckoId = found.coingeckoId;
    }
    if (!coingeckoId) {
      return { price: 0, isPrediction: true, reason: "過去単価の参照元(トークンID)が特定できませんでした。" };
    }
    const p = await fetchHistoricalPrice(coingeckoId, prevTx.date);
    if (!p || p <= 0) return { price: 0, isPrediction: true, reason: "過去の価格データをAPIから取得できませんでした。" };
    return { price: p, isPrediction: true, reason: "過去単価はAPI推定値です。" };
  };

  const hist = await getHistUnitPriceUsd();
  const histUnitPriceUsd = hist.price;

  // 比較対象の「現在単価」
  const currentUnitPriceUsd = isBuyback ? currentToPriceUsd : currentFromPriceUsd;

  // 受取量ベースの総額計算
  const qtyForTotal =
    isBuyback
      ? (isFinite(expectedOutAmt) && expectedOutAmt > 0 ? expectedOutAmt : NaN)
      : inputAmt;

  // 現在総額USD（表示用）
  const currentTotalUsd =
    currentUnitPriceUsd > 0 && isFinite(qtyForTotal) ? currentUnitPriceUsd * qtyForTotal : 0;

  const mainUsd = mainCurrencyPrice?.usd || 0;
  const diffValueMain =
    currentTotalUsd > 0 && mainUsd > 0 ? `${(currentTotalUsd / mainUsd).toFixed(6)} ${mainNet.symbol}` : "---";

  // 表示初期値
  let unitProfitPercent = "---";
  let unitProfitColor = "text-slate-400";
  let displayHistUnitPrice = histUnitPriceUsd > 0 ? `$${formatDisplayPrice(histUnitPriceUsd)}` : "---";
  let displayCurrUnitPrice = currentUnitPriceUsd > 0 ? `$${formatDisplayPrice(currentUnitPriceUsd)}` : "---";

  let totalProfitPercent = "---";
  let totalProfitColor = "text-slate-400";
  let totalDiffUsd = "---";
  let totalDiffJpy = "---";
  let totalPrevUsdDisplay = "---";
  let totalCurrUsdDisplay = currentTotalUsd > 0 ? `$${formatDisplayPrice(currentTotalUsd)}` : "---";

  const isPrediction = hist.isPrediction;
  const reason = hist.reason;

  // 単価損益
  if (histUnitPriceUsd > 0 && currentUnitPriceUsd > 0) {
    const unitDiff = isBuyback ? (histUnitPriceUsd - currentUnitPriceUsd) : (currentUnitPriceUsd - histUnitPriceUsd);
    const pct = unitDiff / histUnitPriceUsd * 100;

    unitProfitPercent = formatPercent(pct);
    unitProfitColor = pct >= 0 ? "text-green-400" : "text-red-400";

    if (isBuyback) {
      displayHistUnitPrice = `$${formatDisplayPrice(histUnitPriceUsd)} (Sold)`;
      displayCurrUnitPrice = `$${formatDisplayPrice(currentUnitPriceUsd)} (Now)`;
    }
  }

  // 総額損益（受取量ベース）
  if (histUnitPriceUsd > 0 && currentUnitPriceUsd > 0 && isFinite(qtyForTotal)) {
    const prevTotalUsd = histUnitPriceUsd * qtyForTotal;
    const currTotalUsd = currentUnitPriceUsd * qtyForTotal;

    const totalDiff = isBuyback ? (prevTotalUsd - currTotalUsd) : (currTotalUsd - prevTotalUsd);
    const pctTotal = totalDiff / prevTotalUsd * 100;

    totalProfitPercent = formatPercent(pctTotal);
    totalProfitColor = pctTotal >= 0 ? "text-green-400" : "text-red-400";

    totalDiffUsd = `$${formatDisplayPrice(totalDiff)}`;
    const jpyRate = mainCurrencyPrice?.jpy && mainCurrencyPrice?.usd ? (mainCurrencyPrice.jpy / mainCurrencyPrice.usd) : 0;
    totalDiffJpy = jpyRate > 0 ? `¥${formatDisplayPrice(totalDiff * jpyRate)}` : "---";

    totalPrevUsdDisplay = `$${formatDisplayPrice(prevTotalUsd)}`;
    totalCurrUsdDisplay = `$${formatDisplayPrice(currTotalUsd)}`;
  } else if (isBuyback && !isFinite(qtyForTotal)) {
    totalDiffUsd = "---";
    totalDiffJpy = "---";
    totalPrevUsdDisplay = "---";
    totalCurrUsdDisplay = currentTotalUsd > 0 ? `$${formatDisplayPrice(currentTotalUsd)}` : "---";
  }

  return {
    diffValueMain,
    unitProfitPercent,
    unitProfitColor,
    displayHistUnitPrice,
    displayCurrUnitPrice,
    totalProfitPercent,
    totalProfitColor,
    totalDiffUsd,
    totalDiffJpy,
    totalPrevUsdDisplay,
    totalCurrUsdDisplay,
    isPrediction,
    reason
  };
};
