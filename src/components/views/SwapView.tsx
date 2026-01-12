import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input } from '../UI';
import { executeSwap } from '../../services/swapService';
import { fetchTokenMetadataAndPrice } from '../../alchemy';
import { fetchHistoricalPrice } from '../../services/priceService';
import { MAJOR_TOKENS_LIST } from '../../constants';
import type { TxHistory, TokenData } from '../../types';

const STABLE_COINS = ['USDC', 'USDT', 'DAI'];

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

export const SwapView = ({ networkKey, allNetworks, mainNetwork, wallet, tokenList, setView, onSwap, txHistory, currentPrice, mainCurrencyPrice }: any) => {
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
    
    // Upper: Unit Price
    unitProfitPercent: string;
    unitProfitColor: string;
    displayHistUnitPrice: string;
    displayCurrUnitPrice: string;

    // Lower: Total Value
    totalProfitPercent: string;
    totalProfitColor: string;
    totalDiffUsd: string;
    totalDiffJpy: string;
    totalPrevUsdDisplay: string;
    totalCurrUsdDisplay: string;
    
    isPrediction?: boolean;
  } | null>(null);

  const [amount, setAmount] = useState<string>('0');
  const [balance, setBalance] = useState<string>('0');
  const [estimatedFee, setEstimatedFee] = useState('0');

  const net = allNetworks[networkKey];
  const mainNet = allNetworks[mainNetwork] || net;
  const majorTokens = MAJOR_TOKENS_LIST[networkKey] || [];

  // Balance Update
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

  // Token Search
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

  const handlePercentInput = (percent: number) => {
    if (!balance) return;
    const balVal = parseFloat(balance);
    if (isNaN(balVal) || balVal <= 0) return;
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

  const calculateComparison = async () => {
    if (!searchedToken) return;

    const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
    const toSym = searchedToken.symbol;
    const inputAmt = parseFloat(amount);

    // Current Unit Price (USD)
    const fromPriceUsd = fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0);
    const toPriceUsd = searchedToken.price?.usd || 0;

    // FromトークンのID特定
    let fromCoingeckoId: string | null = null;
    if (fromType === 'native') {
        fromCoingeckoId = net.coingeckoId;
    } else if (selectedFromToken) {
        const found = majorTokens.find(t => t.address.toLowerCase() === selectedFromToken.address.toLowerCase());
        if (found && found.coingeckoId) fromCoingeckoId = found.coingeckoId;
    }

    // ToトークンのID特定
    let toCoingeckoId: string | null = null;
    if (searchedToken.symbol === net.symbol || searchedToken.symbol === `W${net.symbol}`) {
        toCoingeckoId = net.coingeckoId;
    } else {
        const found = majorTokens.find(t => t.address.toLowerCase() === toInput.toLowerCase());
        if (found && found.coingeckoId) toCoingeckoId = found.coingeckoId;
    }

    // 履歴検索 (逆方向: Profit/Lossチェック用)
    const pairSymbolReverse = `${toSym} > ${fromSym}`;
    const prevTxReverse = txHistory.find((tx: TxHistory) => tx.type === 'swap' && tx.symbol === pairSymbolReverse);

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

    if (prevTxReverse) {
      let histUnitPriceUsd = 0; 
      
      const isFromStable = STABLE_COINS.some(s => fromSym.includes(s));
      const isToStable = STABLE_COINS.some(s => toSym.includes(s));

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
          // 例: PEPE -> USDC (以前 USDC -> PEPE で買ったものを売る)
          
          // 優先1: レートから逆算 (購入時に支払ったStableコインの量から単価を出す)
          // 以前: Stable -> Crypto. Rate = Crypto / Stable.
          // 当時のCrypto単価($) = 1 / Rate.
          if (isToStable && prevTxReverse.exchangeRate) {
              histUnitPriceUsd = 1 / prevTxReverse.exchangeRate;
          }
          // 優先2: APIから取得 (レートがない場合)
          else {
              isPrediction = true;
              const p = await fetchHistoricalPrice(fromCoingeckoId, prevTxReverse.date);
              if (p && p > 0) histUnitPriceUsd = p;
          }
      }
      else if (!isToStable && toCoingeckoId) {
          // パターンC: 買い戻し (Stable/Other -> Crypto)
          // 以前売ったCryptoを買い戻す場合 -> Crypto(To)の過去価格を取得して比較
          
          isPrediction = true;
          const p = await fetchHistoricalPrice(toCoingeckoId, prevTxReverse.date);
          if (p && p > 0) {
              // 買い戻しの場合: (売値 - 買値) / 買値
              if (toPriceUsd > 0) {
                 const diff = (p - toPriceUsd) / toPriceUsd * 100;
                 unitProfitPercent = formatPercent(diff);
                 unitProfitColor = diff >= 0 ? "text-green-400" : "text-red-400";
                 displayHistUnitPrice = `$${formatDisplayPrice(p)} (Sold)`;
                 
                 // 特殊フロー: ここで計算完了
                 histUnitPriceUsd = -1; 
              }
          }
      }
      else if (prevTxReverse.exchangeRate) {
          // パターンD: IDなし、レートのみ (バックアップ)
          // 相手がStableならレートから推測可能
          if (isToStable) {
             histUnitPriceUsd = 1 / prevTxReverse.exchangeRate;
          }
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
          // 買い戻し(Pattern C)の総額比較: From(USDC)の価値は変わらない($1)
          basePriceForTotal = 1.0; 
      }

      if (basePriceForTotal > 0 && fromPriceUsd > 0) {
          const totalPrevUsd = inputAmt * basePriceForTotal;
          const totalCurrUsd = inputAmt * fromPriceUsd;
          
          const totalDiffVal = totalCurrUsd - totalPrevUsd;
          // 0割対策
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

    setComparisonData({
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
      
      const fromPriceUsd = fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0);

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
        priceInUsd: fromPriceUsd, 
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
             <div className="flex gap-1">
               <button onClick={() => handlePercentInput(25)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">25%</button>
               <button onClick={() => handlePercentInput(50)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">50%</button>
               <button onClick={() => handlePercentInput(100)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">MAX</button>
             </div>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <Input value={amount} onChange={(e: any) => setAmount(e.target.value)} type="number" placeholder="0.0" />
            </div>
            <select className="bg-slate-800 text-white p-2 rounded w-32 text-sm border border-slate-600" onChange={handleSelectFrom} value={fromType === 'native' ? 'NATIVE' : selectedFromToken?.address}>
              <option value="NATIVE">{net.symbol} (Native)</option>
              {tokenList.map((t: TokenData) => (<option key={t.address} value={t.address}>{t.symbol}</option>))}
            </select>
          </div>
          <div className="flex justify-center mb-4 text-2xl text-slate-600">↓</div>
          <p className="text-xs text-slate-400 mb-1">交換先</p>
          <div className="mb-2">
            <select className="w-full bg-slate-800 text-white p-2 rounded text-sm border border-slate-600 mb-2" onChange={handleSelectTo} value={uniqueToTokens.some((t: any) => t.address === toInput) ? toInput : 'custom'}>
              <option value="" disabled>トークンを選択してください</option>
              <optgroup label="主要トークン">{uniqueToTokens.filter((t: any) => t.type === 'Major').map((t: any) => (<option key={t.address} value={t.address}>{t.symbol} - {t.name}</option>))}</optgroup>
              <optgroup label="所持トークン">{uniqueToTokens.filter((t: any) => t.type === 'Held').map((t: any) => (<option key={t.address} value={t.address}>{t.symbol} (Held)</option>))}</optgroup>
              <option value="custom">手動入力 (カスタム)</option>
            </select>
            <Input value={toInput} onChange={(e: any) => setToInput(e.target.value)} placeholder="トークンアドレス (0x...)" className="text-xs font-mono" />
          </div>
          <div className="mb-6 h-16">
            {isSearching && <div className="text-xs text-cyan-400 mt-1 animate-pulse">Searching info...</div>}
            {searchedToken && (
              <div className="mt-1 p-2 bg-slate-900/80 rounded border border-cyan-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {searchedToken.logo && <img src={searchedToken.logo} className="w-6 h-6 rounded-full" />}
                  <div><div className="text-sm font-bold text-cyan-100">{searchedToken.name} ({searchedToken.symbol})</div><div className="text-[10px] text-slate-400">Decimals: {searchedToken.decimals}</div></div>
                </div>
                <div className="text-right"><div className="text-xs text-white">Price:</div><div className="text-[10px] text-slate-400">${searchedToken.price.usd} / ¥{searchedToken.price.jpy}</div></div>
              </div>
            )}
          </div>
          <Button onClick={handleProceed} disabled={loading || !amount || !toInput || parseFloat(amount) <= 0}>確認画面へ</Button>
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
            <span className="font-bold text-white">{amount} {fromType === 'native' ? net.symbol : selectedFromToken?.symbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Swap To</span>
            <span className="font-bold text-cyan-300">{searchedToken ? `${searchedToken.symbol}` : toInput.slice(0, 6) + '...'}</span>
          </div>

          {comparisonData && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mt-2 space-y-3">
              
              {/* --- 上段: 単価比較 --- */}
              <div>
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">Unit Price {comparisonData.isPrediction && "(Est)"}</span>
                    <span className={`font-bold ${comparisonData.unitProfitColor}`}>{comparisonData.unitProfitPercent}</span>
                 </div>
                 <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span className="truncate max-w-[45%]">Past: {comparisonData.displayHistUnitPrice}</span>
                    <span className="truncate max-w-[45%]">Now: {comparisonData.displayCurrUnitPrice}</span>
                 </div>
              </div>

              <div className="h-px bg-slate-800"></div>

              {/* --- 下段: 総額比較 --- */}
              <div>
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400">Total Value Diff</span>
                      <span className={`font-bold ${comparisonData.totalProfitColor}`}>{comparisonData.totalProfitPercent}</span>
                  </div>
                  <div className="bg-slate-950/50 p-2 rounded text-[10px] font-mono space-y-1 overflow-hidden">
                      <div className="flex justify-between">
                          <span className="text-slate-500 min-w-[30px]">Past:</span>
                          <span className="text-slate-300 truncate text-right">${comparisonData.totalPrevUsdDisplay}</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-slate-500 min-w-[30px]">Now:</span>
                          <span className="text-cyan-200 truncate text-right">${comparisonData.totalCurrUsdDisplay}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
                          <span className="text-slate-500">Diff:</span>
                          <div className="text-right">
                              <div className={`${comparisonData.totalProfitColor} truncate`}>${comparisonData.totalDiffUsd}</div>
                              <div className={`${comparisonData.totalProfitColor} truncate`}>¥{comparisonData.totalDiffJpy}</div>
                          </div>
                      </div>
                  </div>
              </div>
              
              <div className="h-px bg-slate-800"></div>
              
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span>Est. Value ({mainNet.symbol}):</span>
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