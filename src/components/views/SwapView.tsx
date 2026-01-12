// src/components/views/SwapView.tsx

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input} from '../UI';
import { executeSwap } from '../../services/swapService';
import { fetchTokenMetadataAndPrice } from '../../alchemy'; 
import { MAJOR_TOKENS_LIST } from '../../constants';
import type { TxHistory, TokenData } from '../../types';

export const SwapView = ({ networkKey, allNetworks, wallet, tokenList, setView, onSwap, txHistory, currentPrice }: any) => {
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [loading, setLoading] = useState(false);

  // --- State ---
  const [fromType, setFromType] = useState<'native' | 'token'>('native');
  const [selectedFromToken, setSelectedFromToken] = useState<TokenData | null>(null);

  const [toInput, setToInput] = useState<string>(''); 
  const [searchedToken, setSearchedToken] = useState<any>(null); 
  const [isSearching, setIsSearching] = useState(false);

  // 損益表示用
  const [comparisonData, setComparisonData] = useState<{ 
      diffValueMain: string; 
      diffValueJpy: string; 
      diffValueUsd: string; 
      profitPercent: string; 
      profitColor: string;
      prevRateStr: string;
  } | null>(null);

  const [amount, setAmount] = useState<string>('0');
  const [balance, setBalance] = useState<string>('0');
  const [estimatedFee, setEstimatedFee] = useState('0');

  const net = allNetworks[networkKey];

  // ★修正: 主要トークンリストを取得
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
  }, [fromType, selectedFromToken, networkKey]);

  // Token Search Logic
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

  // ★修正: ドロップダウンリスト作成
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

      calculateComparison();
      setStep('confirm');
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  // ★修正: 損益計算ロジック
  const calculateComparison = () => {
    if (!searchedToken) return;
    
    const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
    const toSym = searchedToken.symbol;
    const inputAmt = parseFloat(amount);

    // 今回のレート推定 (1 From = X To)
    // ToToken(searchedToken)のUSD価格、FromTokenのUSD価格を使って算出
    const fromPriceUsd = fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0);
    const toPriceUsd = searchedToken.price?.usd || 0;
    
    let currentRate = 0; // 1 From = ? To
    if (toPriceUsd > 0 && fromPriceUsd > 0) {
        currentRate = fromPriceUsd / toPriceUsd;
    }

    // 現在価値
    const currentValueUsd = inputAmt * fromPriceUsd;
    const currentValueJpy = inputAmt * (fromType === 'native' ? (currentPrice?.jpy || 0) : (selectedFromToken?.market?.jpy.price || 0));

    // 履歴検索 (同ペア)
    const pairSymbolReverse = `${toSym} > ${fromSym}`; // 逆方向 (前回買ったものを今回売る)

    // 直近の逆方向取引を探す (利確/損切りチェック)
    const prevTxReverse = txHistory.find((tx: TxHistory) => tx.type === 'swap' && tx.symbol === pairSymbolReverse);
    
    let profitPercentStr = "---";
    let profitColor = "text-slate-400";
    let prevRateStr = "No previous data";

    // 1. 逆方向の取引が見つかった場合 (例: 前回 ETH->USDC、今回 USDC->ETH)
    // 逆方向のレートと比較するには、「前回 1 From = ? To」の形に直す必要がある
    // 前回のTx: Buy FromToken using ToToken.
    // TxHistory.amount = ToToken Amount. 
    // TxHistory.receivedAmount (New field) = FromToken Amount.
    // Previous Rate (Cost of 1 From in To) = Amount_To / Amount_From
    if (prevTxReverse && prevTxReverse.exchangeRate) {
       // exchangeRateが保存されている場合 (1 Input = X Output)
       // ReverseTx: Input(ToSym) -> Output(FromSym). Rate = Output / Input = From / To.
       // We want Cost in To per From = Input / Output = 1 / Rate.
       const prevCostRate = 1 / prevTxReverse.exchangeRate; 
       
       // Current Rate (Sell From to get To) = currentRate
       // P/L = (CurrentRate - PrevCostRate) / PrevCostRate
       const diff = (currentRate - prevCostRate) / prevCostRate * 100;
       profitPercentStr = (diff > 0 ? "+" : "") + diff.toFixed(2) + "%";
       profitColor = diff > 0 ? "text-green-400" : "text-red-400";
       prevRateStr = `Prev: 1 ${fromSym} = ${prevCostRate.toFixed(4)} ${toSym}`;

    } else if (prevTxReverse) {
       // 旧データでレートがない場合
       prevRateStr = "Old data (No rate)";
    }

    setComparisonData({
        diffValueMain: `${(currentValueUsd / (currentPrice?.usd || 1)).toFixed(4)} ${net.symbol}`,
        diffValueJpy: `¥${Math.floor(currentValueJpy).toLocaleString()}`,
        diffValueUsd: `$${currentValueUsd.toFixed(2)}`,
        profitPercent: profitPercentStr,
        profitColor,
        prevRateStr
    });
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      const fromAddr = fromType === 'native' ? 'NATIVE' : selectedFromToken!.address;
      const toAddr = toInput;
      const isNative = fromType === 'native';

      // サービスからtxとシミュレーション結果(amountOutRaw)を受け取る
      const { tx, amountOutRaw } = await executeSwap(wallet, networkKey, fromAddr, toAddr, amount, isNative);
      
      const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
      const toSym = searchedToken ? searchedToken.symbol : "Unknown";

      // レート計算 (1 From = ? To)
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
        // ★追加: レート情報を保存
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
           <p className="text-xs text-slate-400 mb-1">交換元 (Balance: {parseFloat(balance).toFixed(4)})</p>
           <div className="flex gap-2 mb-4">
             <div className="flex-1"><Input value={amount} onChange={(e:any) => setAmount(e.target.value)} type="number" placeholder="0.0" /></div>
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
               <optgroup label="主要トークン">{uniqueToTokens.filter((t:any) => t.type === 'Major').map((t: any) => (<option key={t.address} value={t.address}>{t.symbol} - {t.name}</option>))}</optgroup>
               <optgroup label="所持トークン">{uniqueToTokens.filter((t:any) => t.type === 'Held').map((t: any) => (<option key={t.address} value={t.address}>{t.symbol} (Held)</option>))}</optgroup>
               <option value="custom">手動入力 (カスタム)</option>
             </select>
             <Input value={toInput} onChange={(e:any) => setToInput(e.target.value)} placeholder="トークンアドレス (0x...)" className="text-xs font-mono" />
           </div>
           <div className="mb-6 h-16">
             {isSearching && <div className="text-xs text-cyan-400 mt-1 animate-pulse">Searching info...</div>}
             {searchedToken && (
               <div className="mt-1 p-2 bg-slate-900/80 rounded border border-cyan-900/50 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   {searchedToken.logo && <img src={searchedToken.logo} className="w-6 h-6 rounded-full"/>}
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

  return (
    <Wrapper title="確認" backAction={() => setStep('input')}>
      <GlassCard>
        <div className="space-y-4 mb-6">
          <div className="flex justify-between text-sm"><span className="text-slate-400">Swap From</span><span className="font-bold text-white">{amount} {fromType === 'native' ? net.symbol : selectedFromToken?.symbol}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-400">Swap To</span><span className="font-bold text-cyan-300">{searchedToken ? `${searchedToken.symbol}` : toInput.slice(0,6)+'...'}</span></div>
          
          {comparisonData && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mt-2">
               <div className="flex justify-between items-end mb-2">
                   <span className="text-xs text-slate-400">Est. Profit/Loss</span>
                   <div className="text-right">
                       <div className={`font-bold ${comparisonData.profitColor} text-lg`}>{comparisonData.profitPercent}</div>
                       <div className="text-[10px] text-slate-500">{comparisonData.prevRateStr}</div>
                   </div>
               </div>
               <div className="h-px bg-slate-800 my-2"></div>
               <div className="flex flex-col gap-1">
                 <div className="flex justify-between text-xs"><span>Main ({net.symbol}):</span><span className="text-cyan-200 font-mono">{comparisonData.diffValueMain}</span></div>
                 <div className="flex justify-between text-xs"><span>JPY:</span><span className="text-cyan-200 font-mono">{comparisonData.diffValueJpy}</span></div>
                 <div className="flex justify-between text-xs"><span>USD:</span><span className="text-slate-500 font-mono">{comparisonData.diffValueUsd}</span></div>
               </div>
            </div>
          )}
          <div className="border-t border-slate-700 pt-2 flex justify-between text-sm"><span className="text-slate-400">Est. Gas Fee</span><span className="font-mono text-red-300">{estimatedFee.slice(0,8)} {net.symbol}</span></div>
        </div>
        <Button onClick={handleExecute} disabled={loading}>{loading ? "処理中..." : "スワップ実行"}</Button>
      </GlassCard>
    </Wrapper>
  );
};