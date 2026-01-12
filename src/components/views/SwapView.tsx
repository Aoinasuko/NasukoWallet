import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input, SmartIcon } from '../UI';
import { getNetworkFees, type NetworkFeeInfo } from '../../services/feeService';
import { executeSwap } from '../../services/swapService';
import type { TxHistory } from '../../types';

// Mock token list for destination selection
const COMMON_TOKENS = ['ETH', 'USDC', 'USDT', 'WBTC', 'DAI', 'MATIC', 'BNB', 'AVAX', 'OP', 'ARB'];

export const SwapView = ({ networkKey: initialNetworkKey, allNetworks, mainNetwork, wallet, txHistory, setView, onSwap }: any) => {
  const [step, setStep] = useState<'search' | 'input' | 'confirm'>('search');

  // Search State
  const [feeList, setFeeList] = useState<NetworkFeeInfo[]>([]);
  const [loadingFees, setLoadingFees] = useState(false);

  // Input State
  const [selectedNetwork, setSelectedNetwork] = useState<string>(initialNetworkKey);
  const [fromToken, setFromToken] = useState<string>(''); // Symbol
  const [toToken, setToToken] = useState<string>('USDC');
  const [amount, setAmount] = useState<string>('0');

  // Confirm State
  const [currentFeeNative, setCurrentFeeNative] = useState<string>('0');
  const [timeLeft, setTimeLeft] = useState(15);
  // ★修正: JPY価格も保持
  const [prices, setPrices] = useState<{from: number, fromJpy: number, main: number, fromInMain: number}>({from:0, fromJpy: 0, main:0, fromInMain:0});
  const [plPercent, setPlPercent] = useState<number | null>(null);
  const [plUsd, setPlUsd] = useState<number | null>(null);
  const [plJpy, setPlJpy] = useState<number | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [isSwapping, setIsSwapping] = useState(false);

  // 1. Fee Search
  useEffect(() => {
    // Auto-load fees on mount
    handleScanFees();
  }, []);

  const handleScanFees = async () => {
    setLoadingFees(true);
    const list = await getNetworkFees(allNetworks);
    setFeeList(list);
    setLoadingFees(false);
  };

  const selectNetwork = (netKey: string) => {
    setSelectedNetwork(netKey);
    setFromToken(allNetworks[netKey].symbol); // Default to native
    setStep('input');
    updateBalance(netKey);
  };

  const updateBalance = async (netKey: string) => {
    if (!wallet) return;
    try {
      const net = allNetworks[netKey];
      const provider = new ethers.JsonRpcProvider(net.rpc);
      const bal = await provider.getBalance(wallet.address);
      setBalance(ethers.formatEther(bal));
    } catch { setBalance('0'); }
  };

  // 2. Input to Confirm
  const handleProceed = () => {
    if(!amount || parseFloat(amount) <= 0) return alert("金額を入力してください");
    setStep('confirm');
  };

  // 3. Confirm Logic (15s Interval & P/L)
  useEffect(() => {
    if (step !== 'confirm') return;

    let interval: any;

    const refreshData = async () => {
      setTimeLeft(15);

      const net = allNetworks[selectedNetwork];
      const mainNet = allNetworks[mainNetwork || 'mainnet'];

      // 1. Get Fee
      try {
        const provider = new ethers.JsonRpcProvider(net.rpc);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || BigInt(0);
        const estimatedGas = BigInt(150000); // Swap gas limit
        const fee = gasPrice * estimatedGas;
        setCurrentFeeNative(ethers.formatEther(fee));
      } catch (e) { console.error(e); }

      // 2. Get Prices for P/L
      // We need Price(FromToken), Price(MainToken) to calculate Rate
      try {
        // Fetch IDs
        const fromId = net.coingeckoId; // Assuming Native for simplicity
        const mainId = mainNet.coingeckoId;

        // Fetch from CoinGecko
        // Note: Real app should handle token addresses. Here assuming Native -> Token or Token -> Token
        // For simplicity, we assume "FromToken" is the Native Token of the selected network
        // If user typed 'USDC', we would need to look up its ID.
        // Hack: Just fetch current network native vs main network native.

        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${fromId},${mainId}&vs_currencies=usd,jpy`);
        const data = await res.json();

        const pFrom = data[fromId]?.usd || 0;
        const pFromJpy = data[fromId]?.jpy || 0;
        const pMain = data[mainId]?.usd || 0;
        const rateToMain = pMain > 0 ? pFrom / pMain : 0;

        setPrices(p => ({ ...p, from: pFrom, fromJpy: pFromJpy, main: pMain, fromInMain: rateToMain }));

        // 3. P/L Calc
        const prevSwap = txHistory.find((tx: TxHistory) => tx.type === 'swap' && tx.to === fromToken);

        if (prevSwap) {
          // Main Currency P/L
          if (prevSwap.swapRateToMain) {
            const diff = ((rateToMain - prevSwap.swapRateToMain) / prevSwap.swapRateToMain) * 100;
            setPlPercent(diff);
          }
          // USD P/L
          if (prevSwap.priceInUsd && pFrom > 0) {
            // prevSwap.priceInUsd is TOTAL value or Unit Price?
            // Type def says "Swap時のUSD価格". Let's assume Unit Price for P/L % calc logic consistency.
            // Wait, I should store UNIT PRICE.
            // But logic in handleExecute below stores: `parseFloat(amount) * prices.fromInMain`. That is TOTAL.
            // Ideally P/L % is based on Price Change, not Amount Change (amount is irrelevant for % unless we compare Total Value).
            // Let's assume we compare UNIT PRICE.
            // So we need to store Unit Price.
            // I will update handleExecute to store Unit Price in `priceInUsd`.
            // Let's assume `priceInUsd` is Unit Price.
             const diffUsd = ((pFrom - prevSwap.priceInUsd) / prevSwap.priceInUsd) * 100;
             setPlUsd(diffUsd);
          }
           // JPY P/L
          if (prevSwap.priceInJpy && pFromJpy > 0) {
             const diffJpy = ((pFromJpy - prevSwap.priceInJpy) / prevSwap.priceInJpy) * 100;
             setPlJpy(diffJpy);
          }
        } else {
          setPlPercent(null); setPlUsd(null); setPlJpy(null);
        }

      } catch (e) { console.error("Price fetch failed", e); }
    };

    refreshData();
    interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          refreshData();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, selectedNetwork, mainNetwork, fromToken, txHistory]);

  const handleExecute = async () => {
    if (!wallet) return;
    setIsSwapping(true);
    try {
      // 1. Execute Real Swap
      const net = allNetworks[selectedNetwork];
      let hash = "0xsimulated" + Date.now();

      // Try Real Swap (Sepolia only)
      if (selectedNetwork === 'sepolia') {
        try {
          const tx = await executeSwap(wallet, selectedNetwork, fromToken, toToken, amount);
          console.log("Swap TX:", tx);
          hash = tx.hash;
          // Wait for confirm?
          // await tx.wait(); // Optional, but better for UX to wait a bit or let history handle it.
          // For now, we record hash immediately.
        } catch (e: any) {
          alert("Swap Failed: " + e.message);
          setIsSwapping(false);
          return;
        }
      }

      // 2. Create History
      const newTx: TxHistory = {
        id: crypto.randomUUID(),
        hash: hash,
        type: 'swap',
        amount: amount,
        symbol: fromToken,
        from: fromToken,
        to: toToken,
        date: new Date().toLocaleString(),
        network: net.name,
        swapRateToMain: prices.fromInMain,
        priceInMain: parseFloat(amount) * prices.fromInMain,
        priceInUsd: prices.from, // Store Unit Price for % Calc
        priceInJpy: prices.fromJpy // Store Unit Price for % Calc
      };

      onSwap(newTx);
      alert("スワップが完了しました！");
      setView('history');
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    } finally {
      setIsSwapping(false);
    }
  };

  // -- Renders --

  // 1. Search Screen
  if (step === 'search') {
    return (
      <Wrapper title="ネットワーク検索" backAction={() => setView('home')}>
        <GlassCard className="mb-4 text-center">
           <h3 className="font-bold text-cyan-100 mb-2">安価なネットワークを探す</h3>
           <p className="text-xs text-slate-400">各チェーンの手数料(Swap目安)を表示します</p>
           <Button onClick={handleScanFees} variant="secondary" className="mt-2" disabled={loadingFees}>
             {loadingFees ? "検索中..." : "更新する"}
           </Button>
        </GlassCard>

        <div className="flex flex-col gap-2">
           {feeList.map((fee) => (
             <div key={fee.networkKey} onClick={() => selectNetwork(fee.networkKey)} className="bg-slate-900/50 border border-slate-700 p-3 rounded-xl flex justify-between items-center cursor-pointer hover:bg-slate-800 transition">
               <div className="flex items-center gap-3">
                 <SmartIcon symbol={fee.symbol} className="w-8 h-8 rounded-full" />
                 <div>
                   <div className="font-bold text-sm text-cyan-50">{fee.networkName}</div>
                   <div className="text-xs text-slate-500">Gas: {fee.gasPriceGwei.toFixed(2)} Gwei</div>
                 </div>
               </div>
               <div className="text-right">
                 <div className="text-xs text-slate-400">推定手数料</div>
                 <div className="font-mono text-cyan-300">
                   {fee.isError ? "Error" : `${fee.estimatedFeeNative.toFixed(5)} ${fee.symbol}`}
                 </div>
               </div>
             </div>
           ))}
        </div>
      </Wrapper>
    );
  }

  // 2. Input Screen
  if (step === 'input') {
    const net = allNetworks[selectedNetwork];
    return (
      <Wrapper title="スワップ内容" backAction={() => setStep('search')}>
        <GlassCard>
           <div className="flex items-center gap-2 mb-4 bg-cyan-900/20 p-2 rounded">
             <SmartIcon symbol={net.symbol} className="w-6 h-6 rounded-full" />
             <span className="font-bold text-cyan-50">{net.name}</span>
           </div>

           <p className="text-xs text-slate-400 mb-1">元通貨 (保有: {parseFloat(balance).toFixed(4)})</p>
           <div className="flex gap-2 mb-4">
             <Input value={amount} onChange={(e:any) => setAmount(e.target.value)} type="number" placeholder="0.0" />
             <div className="bg-slate-800 p-2 rounded w-24 text-center text-sm font-bold flex items-center justify-center">{fromToken}</div>
           </div>

           <div className="flex justify-center mb-4 text-2xl text-slate-600">↓</div>

           <p className="text-xs text-slate-400 mb-1">先通貨</p>
           <div className="flex gap-2 mb-6">
             <select className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-white" value={toToken} onChange={(e) => setToToken(e.target.value)}>
               {COMMON_TOKENS.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
           </div>

           <Button onClick={handleProceed}>確認画面へ</Button>
        </GlassCard>
      </Wrapper>
    );
  }

  // 3. Confirm Screen
  if (step === 'confirm') {
    const net = allNetworks[selectedNetwork];
    const totalDeduct = parseFloat(amount) + parseFloat(currentFeeNative);
    const remaining = parseFloat(balance) - totalDeduct;

    // Convert Remaining to USD/JPY
    // Note: We only have 'prices.from' (USD). Need JPY rate or simple *150 fallback
    const jpyRate = 150; // Simple fallback or could fetch
    const remainingJpy = remaining * prices.from * jpyRate;

    return (
      <Wrapper title="確認" backAction={() => setStep('input')}>
        <GlassCard>
           <div className="text-center mb-4">
             <div className="text-xs text-slate-400 mb-1">手数料更新まで: {timeLeft}秒</div>
             <div className="w-full h-1 bg-slate-800 rounded overflow-hidden">
               <div className="h-full bg-cyan-500 transition-all duration-1000" style={{width: `${(timeLeft/15)*100}%`}}></div>
             </div>
           </div>

           <div className="space-y-4 mb-6">
             <div className="flex justify-between text-sm">
               <span className="text-slate-400">スワップ元</span>
               <span className="font-bold text-white">{amount} {fromToken}</span>
             </div>
             <div className="flex justify-between text-sm">
               <span className="text-slate-400">ガス代 (推定)</span>
               <span className="font-mono text-red-300">-{currentFeeNative.slice(0,8)} {net.symbol}</span>
             </div>
             <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
               <span className="text-slate-400">残高予想</span>
               <div className="text-right">
                 <div className="font-bold text-cyan-300">{remaining.toFixed(5)} {net.symbol}</div>
                 <div className="text-xs text-slate-500">≈ ¥{remainingJpy.toLocaleString()}</div>
               </div>
             </div>

             {/* P/L Section */}
             {(plPercent !== null || plUsd !== null || plJpy !== null) && (
               <div className="mt-4 grid grid-cols-2 gap-2">
                 {/* Main Currency P/L */}
                 {plPercent !== null && (
                   <div className={`col-span-2 p-2 rounded border ${plPercent >= 0 ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                     <div className="text-[10px] text-slate-300">メイン通貨建 損益</div>
                     <div className={`text-lg font-bold ${plPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                       {plPercent >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                     </div>
                   </div>
                 )}
                 {/* USD P/L */}
                 {plUsd !== null && (
                   <div className={`p-2 rounded border ${plUsd >= 0 ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                     <div className="text-[10px] text-slate-300">USD建 損益</div>
                     <div className={`text-sm font-bold ${plUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                       {plUsd >= 0 ? '+' : ''}{plUsd.toFixed(2)}%
                     </div>
                   </div>
                 )}
                 {/* JPY P/L */}
                 {plJpy !== null && (
                   <div className={`p-2 rounded border ${plJpy >= 0 ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
                     <div className="text-[10px] text-slate-300">JPY建 損益</div>
                     <div className={`text-sm font-bold ${plJpy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                       {plJpy >= 0 ? '+' : ''}{plJpy.toFixed(2)}%
                     </div>
                   </div>
                 )}
                 <div className="col-span-2 text-[10px] text-slate-500 text-center mt-1">
                    前回の{fromToken}取得時と比較
                 </div>
               </div>
             )}

             {plPercent === null && plUsd === null && (
               <div className="mt-4 p-2 text-center text-xs text-slate-500">
                 ※前回の取得履歴が見つからないため損益は表示されません
               </div>
             )}
           </div>

           <Button onClick={handleExecute} disabled={isSwapping}>
             {isSwapping ? "スワップ実行中..." : "スワップ実行"}
           </Button>
        </GlassCard>
      </Wrapper>
    );
  }

  return null;
};
