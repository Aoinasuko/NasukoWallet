import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input } from '../UI';
import { executeSwap } from '../../services/swapService';
import { fetchTokenMetadataAndPrice } from '../../alchemy';
import { fetchHistoricalPrice } from '../../services/priceService';
import { MAJOR_TOKENS_LIST } from '../../constants';
import type { TxHistory, TokenData } from '../../types';

// ステーブルコイン判定用リスト
const STABLE_COINS = ['USDC', 'USDT', 'DAI'];

// 小さな数値を文字列化するときに指数表記(1e-7など)を避けて全桁表示するヘルパー
const formatFullNumber = (num: number) => {
  if (num === 0) return "0";
  // 非常に小さい数はtoFixedで桁数を確保し、末尾の0を消す
  return num.toFixed(20).replace(/\.?0+$/, "");
};

export const SwapView = ({ networkKey, allNetworks, wallet, tokenList, setView, onSwap, txHistory, currentPrice }: any) => {
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [loading, setLoading] = useState(false);

  // --- State ---
  const [fromType, setFromType] = useState<'native' | 'token'>('native');
  const [selectedFromToken, setSelectedFromToken] = useState<TokenData | null>(null);

  const [toInput, setToInput] = useState<string>(''); 
  const [searchedToken, setSearchedToken] = useState<any>(null); 
  const [isSearching, setIsSearching] = useState(false);

  const [comparisonData, setComparisonData] = useState<{
    diffValueMain: string;
    diffValueJpy: string;
    diffValueUsd: string;
    profitPercent: string;
    profitColor: string;
    prevRateStr: string;
    isPrediction?: boolean;
    // ★追加: 総額比較用データ
    totalPrevUsd?: string;
    totalPrevJpy?: string;
    totalCurrUsd?: string;
    totalCurrJpy?: string;
    totalProfitPercent?: string;
    totalProfitColor?: string;
  } | null>(null);

  const [amount, setAmount] = useState<string>('0');
  const [balance, setBalance] = useState<string>('0');
  const [estimatedFee, setEstimatedFee] = useState('0');

  const net = allNetworks[networkKey];
  const majorTokens = MAJOR_TOKENS_LIST[networkKey] || [];

  // 1. Balance Update
  useEffect(() => {
    const updateBalance = async () => {
      if (fromType === 'native') {
        const provider = new ethers.JsonRpcProvider(net.rpc);
        const bal = await provider.getBalance(wallet.address);
        setBalance(ethers.formatEther(bal));
      } else if (selectedFromToken) {
        setBalance(selectedFromToken.balance);
      }
    };
    updateBalance();
  }, [fromType, selectedFromToken, networkKey, wallet.address, net.rpc]);

  // 2. Token Search
  useEffect(() => {
    const searchToken = async () => {
      if (!ethers.isAddress(toInput)) {
        setSearchedToken(null);
        return;
      }
      setIsSearching(true);
      const info = await fetchTokenMetadataAndPrice(toInput, networkKey);
      setSearchedToken(info);
      setIsSearching(false);
    };
    const timer = setTimeout(searchToken, 500);
    return () => clearTimeout(timer);
  }, [toInput, networkKey]);

  // Handlers
  const handleSelectFrom = (e: any) => {
    const val = e.target.value;
    if (val === 'NATIVE') {
      setFromType('native');
      setSelectedFromToken(null);
    } else {
      const token = tokenList.find((t: TokenData) => t.address === val);
      if (token) {
        setFromType('token');
        setSelectedFromToken(token);
      }
    }
  };

  const handleSelectTo = (e: any) => {
    const val = e.target.value;
    if (val === 'custom') return;
    setToInput(val);
  };

  // ★追加: 割合入力ボタンハンドラ
  const handlePercentInput = (percent: number) => {
    if (!balance) return;
    const balVal = parseFloat(balance);
    if (isNaN(balVal) || balVal <= 0) return;
    
    // UI表示用として簡易実装
    const val = balVal * (percent / 100);
    setAmount(val.toString());
  };

  const availableToTokens = [
    ...majorTokens.map(t => ({ symbol: t.symbol, address: t.address, name: t.name, type: 'Major' })),
    ...tokenList.map((t: TokenData) => ({ symbol: t.symbol, address: t.address, name: t.name, type: 'Held' }))
  ];
  const uniqueToTokens = Array.from(new Map(availableToTokens.map((item: any) => [item.address.toLowerCase(), item])).values());

  const handleProceed = async () => {
    if (!amount || parseFloat(amount) <= 0) return alert("金額を入力してください");
    if (!ethers.isAddress(toInput)) return alert("送信先トークンを選択または正しいアドレスを入力してください");

    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(net.rpc);
      const feeData = await provider.getFeeData();
      const fee = (feeData.gasPrice || BigInt(0)) * BigInt(200000);
      setEstimatedFee(ethers.formatEther(fee));

      await calculateComparison();

      setStep('confirm');
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ★修正: 損益計算ロジック
  const calculateComparison = async () => {
    if (!searchedToken) return;

    const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
    const toSym = searchedToken.symbol;
    const inputAmt = parseFloat(amount);

    const fromPriceUsd = fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0);
    const fromPriceJpy = fromType === 'native' ? (currentPrice?.jpy || 0) : (selectedFromToken?.market?.jpy.price || 0);
    const toPriceUsd = searchedToken.price?.usd || 0;

    // FromトークンのCoinGecko ID特定
    let fromCoingeckoId: string | null = null;
    if (fromType === 'native') {
        fromCoingeckoId = net.coingeckoId;
    } else if (selectedFromToken) {
        const found = majorTokens.find(t => t.address.toLowerCase() === selectedFromToken.address.toLowerCase());
        if (found && found.coingeckoId) fromCoingeckoId = found.coingeckoId;
    }

    let currentRate = 0;
    if (toPriceUsd > 0 && fromPriceUsd > 0) {
      currentRate = fromPriceUsd / toPriceUsd;
    }

    // 現在価値(今回売るものの現在の総額)
    const currentValueUsd = inputAmt * fromPriceUsd;
    const currentValueJpy = inputAmt * fromPriceJpy;

    // 履歴検索 (逆方向: Profit/Lossチェック用)
    const pairSymbolReverse = `${toSym} > ${fromSym}`;
    const prevTxReverse = txHistory.find((tx: TxHistory) => tx.type === 'swap' && tx.symbol === pairSymbolReverse);

    let profitPercentStr = "---";
    let profitColor = "text-slate-400";
    let prevRateStr = "No previous data";
    let isPrediction = false;

    // 総額比較用
    let totalPrevUsdStr = "---";
    let totalPrevJpyStr = "---";
    let totalProfitPercentStr = "---";
    let totalProfitColor = "text-slate-400";

    if (prevTxReverse) {
      // 過去のレート算出用変数
      let histPriceUsd = 0; // 当時のFromトークン単価(USD)

      if (prevTxReverse.exchangeRate) {
        // A. 正確なレートデータがある場合 (1 To = X From)
        // Rate = Output / Input = From / To
        // Cost of 1 From in To = 1 / Rate
        const prevCostRate = 1 / prevTxReverse.exchangeRate;
        const diff = (currentRate - prevCostRate) / prevCostRate * 100;
        profitPercentStr = (diff > 0 ? "+" : "") + diff.toFixed(2) + "%";
        profitColor = diff > 0 ? "text-green-400" : "text-red-400";
        // ★修正: 小さな値でも全桁表示
        prevRateStr = `Prev: 1 ${fromSym} = ${formatFullNumber(prevCostRate)} ${toSym}`;
      } 
      
      // B. 過去の単価・総額計算
      isPrediction = true;
      if (profitPercentStr === "---") prevRateStr = "Est. from History";

      const isFromStable = STABLE_COINS.some(s => fromSym.includes(s));
      const isToStable = STABLE_COINS.some(s => toSym.includes(s));

      if (isFromStable && isToStable) {
          profitPercentStr = "≈ 0.00%";
          profitColor = "text-slate-400";
          prevRateStr = "Est. (Stable Peg)";
          histPriceUsd = 1; // Stable
      }
      else if (fromCoingeckoId) {
          // 今回売るトークン(From)の、以前買った時の価格を取得
          const p = await fetchHistoricalPrice(fromCoingeckoId, prevTxReverse.date);
          if (p) {
              histPriceUsd = p;
              // 単価比較 (レートがない場合のバックアップ)
              if (profitPercentStr === "---" || profitPercentStr.includes("Est")) {
                  const diff = (fromPriceUsd - p) / p * 100;
                  profitPercentStr = (diff > 0 ? "+" : "") + diff.toFixed(2) + "%";
                  profitColor = diff > 0 ? "text-green-400" : "text-red-400";
                  prevRateStr = `Est. Buy Price: $${formatFullNumber(p)}`;
              }
          }
      }
      
      // 総額計算 (前回購入額 vs 現在売却額)
      if (histPriceUsd > 0) {
          const totalPrevUsd = inputAmt * histPriceUsd;
          // JPYは簡易的に現在のレート(USD/JPY)を利用
          const usdJpyRate = (currentPrice?.usd && currentPrice?.jpy) ? (currentPrice.jpy / currentPrice.usd) : 150;
          const totalPrevJpy = totalPrevUsd * usdJpyRate;

          totalPrevUsdStr = `$${formatFullNumber(totalPrevUsd)}`;
          totalPrevJpyStr = `¥${formatFullNumber(totalPrevJpy)}`;
          
          const totalDiff = (currentValueUsd - totalPrevUsd) / totalPrevUsd * 100;
          totalProfitPercentStr = (totalDiff > 0 ? "+" : "") + totalDiff.toFixed(2) + "%";
          totalProfitColor = totalDiff > 0 ? "text-green-400" : "text-red-400";
      }
    }

    setComparisonData({
      diffValueMain: `${formatFullNumber(currentValueUsd / (currentPrice?.usd || 1))} ${net.symbol}`,
      diffValueJpy: `¥${Math.floor(currentValueJpy).toLocaleString()}`,
      diffValueUsd: `$${currentValueUsd.toFixed(2)}`,
      profitPercent: profitPercentStr,
      profitColor,
      prevRateStr,
      isPrediction,
      // 総額データ
      totalPrevUsd: totalPrevUsdStr,
      totalPrevJpy: totalPrevJpyStr,
      totalCurrUsd: `$${formatFullNumber(currentValueUsd)}`,
      totalCurrJpy: `¥${formatFullNumber(currentValueJpy)}`,
      totalProfitPercent: totalProfitPercentStr,
      totalProfitColor
    });
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      const fromAddr = fromType === 'native' ? 'NATIVE' : selectedFromToken!.address;
      const toAddr = toInput;
      const isNative = fromType === 'native';

      const { tx, amountOutRaw } = await executeSwap(wallet, networkKey, fromAddr, toAddr, amount, isNative);

      const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
      const toSym = searchedToken ? searchedToken.symbol : "Unknown";

      const decimalsTo = searchedToken.decimals || 18;
      const amountOutVal = parseFloat(ethers.formatUnits(amountOutRaw, decimalsTo));
      const amountInVal = parseFloat(amount);
      const rate = amountInVal > 0 ? amountOutVal / amountInVal : 0;

      const newTx: TxHistory = {
        id: crypto.randomUUID(),
        hash: tx.hash,
        type: 'swap',
        amount: amount,
        symbol: `${fromSym} > ${toSym}`,
        from: wallet.address,
        to: toSym,
        date: new Date().toLocaleString('ja-JP'),
        network: net.name,
        receivedAmount: ethers.formatUnits(amountOutRaw, decimalsTo),
        exchangeRate: rate,
        priceInUsd: searchedToken.price?.usd || 0,
        priceInJpy: searchedToken.price?.jpy || 0,
      };

      onSwap(newTx);
      alert("スワップ完了！");
      setView('history');
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'input') {
    return (
      <Wrapper title="スワップ" backAction={() => setView('home')}>
        <GlassCard>
          {/* FROM SECTION */}
          <div className="flex justify-between items-end mb-1">
             <p className="text-xs text-slate-400">交換元 (Balance: {parseFloat(balance).toFixed(4)})</p>
             {/* ★追加: 割合入力ボタン */}
             <div className="flex gap-1">
               <button onClick={() => handlePercentInput(25)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">25%</button>
               <button onClick={() => handlePercentInput(50)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">50%</button>
               <button onClick={() => handlePercentInput(100)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">MAX</button>
             </div>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <Input
                value={amount}
                onChange={(e: any) => setAmount(e.target.value)}
                type="number"
                placeholder="0.0"
              />
            </div>
            <select
              className="bg-slate-800 text-white p-2 rounded w-32 text-sm border border-slate-600"
              onChange={handleSelectFrom}
              value={fromType === 'native' ? 'NATIVE' : selectedFromToken?.address}
            >
              <option value="NATIVE">{net.symbol} (Native)</option>
              {tokenList.map((t: TokenData) => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-center mb-4 text-2xl text-slate-600">↓</div>

          {/* TO SECTION */}
          <p className="text-xs text-slate-400 mb-1">交換先</p>

          <div className="mb-2">
            <select
              className="w-full bg-slate-800 text-white p-2 rounded text-sm border border-slate-600 mb-2"
              onChange={handleSelectTo}
              value={uniqueToTokens.some((t: any) => t.address === toInput) ? toInput : 'custom'}
            >
              <option value="" disabled>トークンを選択してください</option>
              <optgroup label="主要トークン">
                {uniqueToTokens.filter((t: any) => t.type === 'Major').map((t: any) => (
                  <option key={t.address} value={t.address}>{t.symbol} - {t.name}</option>
                ))}
              </optgroup>
              <optgroup label="所持トークン">
                {uniqueToTokens.filter((t: any) => t.type === 'Held').map((t: any) => (
                  <option key={t.address} value={t.address}>{t.symbol} (Held)</option>
                ))}
              </optgroup>
              <option value="custom">手動入力 (カスタム)</option>
            </select>

            <Input
              value={toInput}
              onChange={(e: any) => setToInput(e.target.value)}
              placeholder="トークンアドレス (0x...)"
              className="text-xs font-mono"
            />
          </div>

          <div className="mb-6 h-16">
            {isSearching && <div className="text-xs text-cyan-400 mt-1 animate-pulse">Searching info...</div>}

            {searchedToken && (
              <div className="mt-1 p-2 bg-slate-900/80 rounded border border-cyan-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {searchedToken.logo && <img src={searchedToken.logo} className="w-6 h-6 rounded-full" />}
                  <div>
                    <div className="text-sm font-bold text-cyan-100">{searchedToken.name} ({searchedToken.symbol})</div>
                    <div className="text-[10px] text-slate-400">Decimals: {searchedToken.decimals}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white">Price:</div>
                  <div className="text-[10px] text-slate-400">
                    ${searchedToken.price.usd} / ¥{searchedToken.price.jpy}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleProceed} disabled={loading || !amount || !toInput || parseFloat(amount) <= 0}>
            確認画面へ
          </Button>
        </GlassCard>
      </Wrapper>
    );
  }

  // CONFIRM SECTION
  return (
    <Wrapper title="確認" backAction={() => setStep('input')}>
      <GlassCard>
        <div className="space-y-4 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Swap From</span>
            <span className="font-bold text-white">
              {amount} {fromType === 'native' ? net.symbol : selectedFromToken?.symbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Swap To</span>
            <span className="font-bold text-cyan-300">
              {searchedToken ? `${searchedToken.symbol}` : toInput.slice(0, 6) + '...'}
            </span>
          </div>

          {comparisonData && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mt-2">
              {/* 単価比較 */}
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs text-slate-400">
                  Unit Price Diff
                  {comparisonData.isPrediction && <span className="text-[9px] text-yellow-500 ml-1">(Est)</span>}
                </span>
                <div className="text-right">
                  <div className={`font-bold ${comparisonData.profitColor} text-lg`}>{comparisonData.profitPercent}</div>
                  {/* ★修正: 単価が小さくても全桁表示 */}
                  <div className="text-[10px] text-slate-500 break-all">{comparisonData.prevRateStr}</div>
                </div>
              </div>

              <div className="h-px bg-slate-800 my-2"></div>

              {/* ★追加: 総額比較 (USD/JPY) */}
              <div className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400">Total Value Diff</span>
                      <span className={`font-bold ${comparisonData.totalProfitColor}`}>{comparisonData.totalProfitPercent}</span>
                  </div>
                  <div className="bg-slate-950/50 p-2 rounded text-[10px] font-mono space-y-1">
                      <div className="flex justify-between">
                          <span className="text-slate-500">Prev Buy:</span>
                          <span className="text-slate-300">{comparisonData.totalPrevUsd} / {comparisonData.totalPrevJpy}</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-slate-500">Curr Sell:</span>
                          <span className="text-cyan-200">{comparisonData.totalCurrUsd} / {comparisonData.totalCurrJpy}</span>
                      </div>
                  </div>
              </div>
              
              <div className="h-px bg-slate-800 my-2"></div>
              
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span>Est. Value ({net.symbol}):</span>
                  <span className="text-cyan-200 font-mono">{comparisonData.diffValueMain}</span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
            <span className="text-slate-400">Est. Gas Fee</span>
            <span className="font-mono text-red-300">{estimatedFee.slice(0, 8)} {net.symbol}</span>
          </div>
        </div>

        <Button onClick={handleExecute} disabled={loading}>
          {loading ? "処理中..." : "スワップ実行"}
        </Button>
      </GlassCard>
    </Wrapper>
  );
};