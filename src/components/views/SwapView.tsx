import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input, SmartIcon } from '../UI';
import { getNetworkFees, type NetworkFeeInfo } from '../../services/feeService';
import { executeSwap } from '../../services/swapService';
import type { TxHistory } from '../../types';

const COMMON_TOKENS = ['ETH', 'USDC', 'USDT', 'WBTC', 'DAI', 'MATIC', 'BNB', 'AVAX', 'OP', 'ARB'];

export const SwapView = ({ networkKey: initialNetworkKey, allNetworks, mainNetwork, wallet, txHistory, setView, onSwap }: any) => {
  const [step, setStep] = useState<'search' | 'input' | 'confirm'>('search');
  // ... (State定義はそのまま) ...
  const [feeList, setFeeList] = useState<NetworkFeeInfo[]>([]);
  const [loadingFees, setLoadingFees] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<string>(initialNetworkKey);
  const [fromToken, setFromToken] = useState<string>(''); 
  const [toToken, setToToken] = useState<string>('USDC');
  const [amount, setAmount] = useState<string>('0');
  const [currentFeeNative, setCurrentFeeNative] = useState<string>('0');
  const [timeLeft, setTimeLeft] = useState(15);
  const [prices, setPrices] = useState<{from: number, fromJpy: number, main: number, fromInMain: number}>({from:0, fromJpy: 0, main:0, fromInMain:0});
  const [plPercent, setPlPercent] = useState<number | null>(null);
  const [plUsd, setPlUsd] = useState<number | null>(null);
  const [plJpy, setPlJpy] = useState<number | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [isSwapping, setIsSwapping] = useState(false);

  useEffect(() => { handleScanFees(); }, []);

  const handleScanFees = async () => {
    setLoadingFees(true);
    const list = await getNetworkFees(allNetworks);
    setFeeList(list);
    setLoadingFees(false);
  };

  const selectNetwork = (netKey: string) => {
    setSelectedNetwork(netKey);
    setFromToken(allNetworks[netKey].symbol); 
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

  const handleProceed = () => {
    if(!amount || parseFloat(amount) <= 0) return alert("金額を入力してください");
    setStep('confirm');
  };

  useEffect(() => {
    if (step !== 'confirm') return;
    let interval: any;
    const refreshData = async () => {
      setTimeLeft(15);
      const net = allNetworks[selectedNetwork];
      const mainNet = allNetworks[mainNetwork || 'mainnet'];
      try {
        const provider = new ethers.JsonRpcProvider(net.rpc);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || BigInt(0);
        const estimatedGas = BigInt(150000); 
        const fee = gasPrice * estimatedGas;
        setCurrentFeeNative(ethers.formatEther(fee));
      } catch (e) { console.error(e); }

      try {
        const fromId = net.coingeckoId; 
        const mainId = mainNet.coingeckoId;
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${fromId},${mainId}&vs_currencies=usd,jpy`);
        const data = await res.json();
        const pFrom = data[fromId]?.usd || 0;
        const pFromJpy = data[fromId]?.jpy || 0;
        const pMain = data[mainId]?.usd || 0;
        const rateToMain = pMain > 0 ? pFrom / pMain : 0;
        setPrices(p => ({ ...p, from: pFrom, fromJpy: pFromJpy, main: pMain, fromInMain: rateToMain }));

        const prevSwap = txHistory.find((tx: TxHistory) => tx.type === 'swap' && tx.symbol.includes(fromToken));
        // ... (P/L計算はそのまま) ...
      } catch (e) { console.error(e); }
    };
    refreshData();
    interval = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { refreshData(); return 15; } return prev - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, selectedNetwork, mainNetwork, fromToken, txHistory]);

  const handleExecute = async () => {
    if (!wallet) return;
    setIsSwapping(true);
    try {
      const net = allNetworks[selectedNetwork];
      let hash = "0xsimulated" + Date.now();

      if (selectedNetwork === 'sepolia') {
        const tx = await executeSwap(wallet, selectedNetwork, fromToken, toToken, amount);
        hash = tx.hash;
      }

      // ★修正: 一時履歴データの作成
      const newTx: TxHistory = {
        id: crypto.randomUUID(),
        hash: hash,
        type: 'swap',
        amount: amount,
        // シンボルを「ETH > USDC」形式に統一
        symbol: `${fromToken} > ${toToken}`,
        from: wallet.address, // ★重要: 自分のアドレスを入れる（フィルターで消えないように）
        to: wallet.address,   // ★重要
        date: new Date().toLocaleString('ja-JP'),
        network: net.name,
      };

      onSwap(newTx);
      alert("スワップが完了しました！");
      setView('history');
    } catch (e: any) {
      console.error(e);
      alert("エラーが発生しました: " + e.message);
    } finally {
      setIsSwapping(false);
    }
  };

  // ... (JSXレンダリング部分は変更なしなので省略。既存のコードを使用してください) ...
  // ※ Search, Input, Confirm の各表示ブロックはそのまま使えます
  
  if (step === 'search') {
    return (
      <Wrapper title="ネットワーク検索" backAction={() => setView('home')}>
        <GlassCard className="mb-4 text-center"><h3 className="font-bold text-cyan-100 mb-2">安価なネットワークを探す</h3><Button onClick={handleScanFees} variant="secondary" className="mt-2" disabled={loadingFees}>{loadingFees ? "検索中..." : "更新する"}</Button></GlassCard>
        <div className="flex flex-col gap-2">{feeList.map((fee) => (<div key={fee.networkKey} onClick={() => selectNetwork(fee.networkKey)} className="bg-slate-900/50 border border-slate-700 p-3 rounded-xl flex justify-between items-center cursor-pointer hover:bg-slate-800 transition"><div className="flex items-center gap-3"><SmartIcon symbol={fee.symbol} className="w-8 h-8 rounded-full" /><div><div className="font-bold text-sm text-cyan-50">{fee.networkName}</div><div className="text-xs text-slate-500">Gas: {fee.gasPriceGwei.toFixed(2)} Gwei</div></div></div><div className="text-right"><div className="text-xs text-slate-400">推定手数料</div><div className="font-mono text-cyan-300">{fee.isError ? "Error" : `${fee.estimatedFeeNative.toFixed(5)} ${fee.symbol}`}</div></div></div>))}</div>
      </Wrapper>
    );
  }

  if (step === 'input') {
    const net = allNetworks[selectedNetwork];
    return (
      <Wrapper title="スワップ内容" backAction={() => setStep('search')}>
        <GlassCard>
           <div className="flex items-center gap-2 mb-4 bg-cyan-900/20 p-2 rounded"><SmartIcon symbol={net.symbol} className="w-6 h-6 rounded-full" /><span className="font-bold text-cyan-50">{net.name}</span></div>
           <p className="text-xs text-slate-400 mb-1">元通貨 (保有: {parseFloat(balance).toFixed(4)})</p><div className="flex gap-2 mb-4"><Input value={amount} onChange={(e:any) => setAmount(e.target.value)} type="number" placeholder="0.0" /><div className="bg-slate-800 p-2 rounded w-24 text-center text-sm font-bold flex items-center justify-center">{fromToken}</div></div>
           <div className="flex justify-center mb-4 text-2xl text-slate-600">↓</div>
           <p className="text-xs text-slate-400 mb-1">先通貨</p><div className="flex gap-2 mb-6"><select className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-white" value={toToken} onChange={(e) => setToToken(e.target.value)}>{COMMON_TOKENS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
           <Button onClick={handleProceed}>確認画面へ</Button>
        </GlassCard>
      </Wrapper>
    );
  }

  if (step === 'confirm') {
    const net = allNetworks[selectedNetwork];
    const totalDeduct = parseFloat(amount) + parseFloat(currentFeeNative);
    const remaining = parseFloat(balance) - totalDeduct;
    return (
      <Wrapper title="確認" backAction={() => setStep('input')}>
        <GlassCard>
           <div className="text-center mb-4"><div className="text-xs text-slate-400 mb-1">手数料更新まで: {timeLeft}秒</div><div className="w-full h-1 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-cyan-500 transition-all duration-1000" style={{width: `${(timeLeft/15)*100}%`}}></div></div></div>
           <div className="space-y-4 mb-6">
             <div className="flex justify-between text-sm"><span className="text-slate-400">スワップ元</span><span className="font-bold text-white">{amount} {fromToken}</span></div>
             <div className="flex justify-between text-sm"><span className="text-slate-400">ガス代 (推定)</span><span className="font-mono text-red-300">-{currentFeeNative.slice(0,8)} {net.symbol}</span></div>
             <div className="border-t border-slate-700 pt-2 flex justify-between text-sm"><span className="text-slate-400">残高予想</span><div className="text-right"><div className="font-bold text-cyan-300">{remaining.toFixed(5)} {net.symbol}</div></div></div>
           </div>
           <Button onClick={handleExecute} disabled={isSwapping}>{isSwapping ? "スワップ実行中..." : "スワップ実行"}</Button>
        </GlassCard>
      </Wrapper>
    );
  }
  return null;
};