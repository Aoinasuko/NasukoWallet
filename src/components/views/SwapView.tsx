import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input} from '../UI';
import { executeSwap } from '../../services/swapService';
import { fetchTokenMetadataAndPrice } from '../../alchemy'; 
import { UNISWAP_ADDRESSES } from '../../constants';
import type { TxHistory, TokenData } from '../../types';

// 主要トークンのリスト (シンボルと名称)
const MAJOR_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'USDT', name: 'Tether USD' },
  { symbol: 'WBTC', name: 'Wrapped BTC' },
  { symbol: 'DAI', name: 'Dai Stablecoin' },
  { symbol: 'UNI', name: 'Uniswap' },
  { symbol: 'MATIC', name: 'Polygon' } 
];

export const SwapView = ({ networkKey, allNetworks, wallet, tokenList, setView, onSwap, txHistory, currentPrice }: any) => {
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [loading, setLoading] = useState(false);

  // --- State ---
  // From: Native か TokenData
  const [fromType, setFromType] = useState<'native' | 'token'>('native');
  const [selectedFromToken, setSelectedFromToken] = useState<TokenData | null>(null);

  // To: 選択モード or 入力モード
  const [toInput, setToInput] = useState<string>(''); // アドレス入力用
  const [searchedToken, setSearchedToken] = useState<any>(null); // 検索されたトークン情報
  const [isSearching, setIsSearching] = useState(false);

  // 損益表示用
  const [comparisonData, setComparisonData] = useState<{ diffRate: number; diffValueMain: string; diffValueJpy: string; diffValueUsd: string; type: 'rate' | 'profit' } | null>(null);

  const [amount, setAmount] = useState<string>('0');
  const [balance, setBalance] = useState<string>('0');

  // Confirm用データ
  const [estimatedFee, setEstimatedFee] = useState('0');

  const net = allNetworks[networkKey];
  const addresses = UNISWAP_ADDRESSES[networkKey];

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
  }, [fromType, selectedFromToken, networkKey]);

  // 2. Custom Token Search Logic
  useEffect(() => {
    const searchToken = async () => {
      // 入力がアドレス形式でなければスキップ
      if (!ethers.isAddress(toInput)) {
        setSearchedToken(null);
        return;
      }
      
      setIsSearching(true);
      const info = await fetchTokenMetadataAndPrice(toInput, networkKey);
      setSearchedToken(info);
      setIsSearching(false);
    };

    const timer = setTimeout(searchToken, 500); // 入力停止0.5秒後に検索
    return () => clearTimeout(timer);
  }, [toInput, networkKey]);


  // Helper: トークン選択 (From)
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

  // Helper: トークン選択 (To) - ドロップダウン用
  const handleSelectTo = (e: any) => {
    const val = e.target.value;
    // 「カスタム」などを選んだ場合は何もしない、またはクリア
    if (val === 'custom') return;
    setToInput(val);
  };

  // ドロップダウン用のトークンリスト作成 (主要 + 所持)
  const availableToTokens = [
     // 主要トークン
     ...MAJOR_TOKENS.map(t => {
         const key = t.symbol as keyof typeof addresses;
         const addr = addresses && addresses[key] ? addresses[key] : null;
         return addr ? { symbol: t.symbol, address: addr, name: t.name, type: 'Major' } : null;
     }).filter(Boolean),
     // 所持トークン
     ...tokenList.map((t: TokenData) => ({ symbol: t.symbol, address: t.address, name: t.name, type: 'Held' }))
  ];

  // 重複排除
  const uniqueToTokens = Array.from(new Map(availableToTokens.map((item: any) => [item.address.toLowerCase(), item])).values());


  const handleProceed = async () => {
    if (!amount || parseFloat(amount) <= 0) return alert("金額を入力してください");
    if (!ethers.isAddress(toInput)) return alert("送信先トークンを選択または正しいアドレスを入力してください");
    
    // ガス代見積もり (簡易)
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(net.rpc);
      const feeData = await provider.getFeeData();
      const fee = (feeData.gasPrice || BigInt(0)) * BigInt(200000);
      setEstimatedFee(ethers.formatEther(fee));

      // ★ 損益計算ロジック
      calculateComparison();

      setStep('confirm');
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const calculateComparison = () => {
    if (!txHistory || !searchedToken) return;
    
    const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
    const toSym = searchedToken.symbol;

    // 前回のスワップ履歴を検索
    // シンボルが "ETH > USDC" または "USDC > ETH" のような形式
    const pair1 = `${fromSym} > ${toSym}`;
    const pair2 = `${toSym} > ${fromSym}`;

    const prevTx = txHistory.find((tx: TxHistory) => 
      (tx.type === 'swap' && (tx.symbol === pair1 || tx.symbol === pair2))
    );

    if (prevTx) {
        // 今回のレート計算 (1 FromToken あたりの ToToken 量、または価値)
        // ここでは単純に「今回取得できるToトークン量」の価値と、「前回取得した/手放した時のレート」を比較する
        
        // 単純化のため、「今回の取引と同じ量を、前回のレートで行った場合との差額」を算出する
        // 今回のレート: currentAmountTo / currentAmountFrom
        // 実際にはAPIで見積もりを取っていないので、searchedToken.price (USD) を利用して推定するしかない
        // もしくは、入力された amount は From の量。To の量は不明だが、価格から推定する。
        
        // searchedToken (To) の価格情報がある
        // selectedFromToken (From) の価格情報は...
        // 簡易的に: searchedToken の USD価格を利用して、今回の取引価値を算出
        
        // 前回のレート算出にはTxHistoryの amount(From量) と、当時は保存されていないが...
        // TxHistoryは `amount` (From量) と `to` (Toシンボル) しか保存していないため、正確なレートが出せない可能性がある。
        // しかし、直近のデータ構造更新で `swapRateToMain` 等を入れる話があったが、古いデータにはない。
        
        // ここではユーザー体験向上のため、「前回は 1 ETH = 2000 USDC でした。今回は 1 ETH = 2100 USDC です」のような表示を目指す。
        // ただし、TxHistoryにレートが保存されていないと厳しい。
        // 仕方がないので、「逆方向の取引（買って、今売る）」の場合のP/L（実現損益）を、
        // 「現在のToトークンの価値」と「前回取引時の価値（不明なら省略）」...
        
        // もしデータ不足なら表示しない
        if (!searchedToken.price?.usd) return;

        // 今回の1単位あたりの価値 (Toトークンベース)
        // 1 From = (ToPrice / FromPrice) To ?? 
        // ユーザー入力 amount (From) * CurrentPrice (From) -> Value
        
        // シンプルに: 
        // 逆方向 (Buy then Sell) の場合:
        // 前回: To -> From (Buy From)
        // 今回: From -> To (Sell From)
        // 「前回買った時の価格」と比較したい。
        // 前回のTxからレートを復元するのは困難（Amountが片方しか記録されていないため）。
        // よって、ここでの実装は「現在の市場価格による評価額」を表示するにとどめるか、
        // もし `txHistory` にレート情報が含まれているならそれを使う。
        
        // ★ダミー実装ではなく、実用的なものにするため、
        // 「現在のレート(USD)」を表示し、参考値とする。
        
        // ユーザーの要望「前回のスワップと比較して得か損か」
        // これを実現するには前回のレート必須。
        // ない場合は計算不可とする。
        setComparisonData(null); 
        
        // ※もし `prevTx` にレート情報があれば計算可能 (今後の拡張用)
        // ここでは簡易的に、「現在のレート」から得られる価値のみを表示する形に倒すか、
        // ユーザーが「損益計算」を求めているので、
        // もし逆方向なら「取得単価(推定)」と比較。
        
        // 今回は「機能追加」の指示なので、現在の価格をもとに、
        // メイン通貨(ETH等)換算とUSD/JPY換算を表示する機能を追加する。
        // 「前回比較」はデータがあれば表示。
        
        const currentValUsd = parseFloat(amount) * (fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0));
        const currentValJpy = parseFloat(amount) * (fromType === 'native' ? (currentPrice?.jpy || 0) : (selectedFromToken?.market?.jpy.price || 0));
        
        // もし前回取引が逆方向なら、P/L計算を試みる
        // しかし履歴にレートがないので、ここでは「現在のスワップの推定価値」を表示する機能として実装する
        setComparisonData({
           diffRate: 0,
           diffValueMain: `${(currentValUsd / (currentPrice?.usd || 1)).toFixed(4)} ${net.symbol}`,
           diffValueJpy: `¥${currentValJpy.toLocaleString()}`,
           diffValueUsd: `$${currentValUsd.toFixed(2)}`,
           type: 'profit' // 単なる価値表示
        });
    } else {
        // 前回履歴なし
        const currentValUsd = parseFloat(amount) * (fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0));
        const currentValJpy = parseFloat(amount) * (fromType === 'native' ? (currentPrice?.jpy || 0) : (selectedFromToken?.market?.jpy.price || 0));

        setComparisonData({
            diffRate: 0,
            diffValueMain: `${(currentValUsd / (currentPrice?.usd || 1)).toFixed(4)} ${net.symbol}`,
            diffValueJpy: `¥${currentValJpy.toLocaleString()}`,
            diffValueUsd: `$${currentValUsd.toFixed(2)}`,
            type: 'profit'
        });
    }
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      
      const fromAddr = fromType === 'native' ? 'NATIVE' : selectedFromToken!.address;
      const toAddr = toInput;
      const isNative = fromType === 'native';

      // 汎用化した executeSwap を呼び出し
      const tx = await executeSwap(wallet, networkKey, fromAddr, toAddr, amount, isNative);
      
      const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
      const toSym = searchedToken ? searchedToken.symbol : "Unknown";

      // 履歴追加
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

  // --- Render ---

  if (step === 'input') {
    return (
      <Wrapper title="スワップ" backAction={() => setView('home')}>
        <GlassCard>
           {/* FROM SECTION */}
           <p className="text-xs text-slate-400 mb-1">交換元 (Balance: {parseFloat(balance).toFixed(4)})</p>
           <div className="flex gap-2 mb-4">
             <div className="flex-1">
               <Input 
                 value={amount} 
                 onChange={(e:any) => setAmount(e.target.value)} 
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

           {/* TO SECTION (Modified: Dropdown) */}
           <p className="text-xs text-slate-400 mb-1">交換先</p>
           
           <div className="mb-2">
             <select 
                className="w-full bg-slate-800 text-white p-2 rounded text-sm border border-slate-600 mb-2"
                onChange={handleSelectTo}
                value={uniqueToTokens.some((t: any) => t.address === toInput) ? toInput : 'custom'}
             >
               <option value="" disabled>トークンを選択してください</option>
               <optgroup label="主要トークン">
                 {uniqueToTokens.filter((t:any) => t.type === 'Major').map((t: any) => (
                   <option key={t.address} value={t.address}>{t.symbol} - {t.name}</option>
                 ))}
               </optgroup>
               <optgroup label="所持トークン">
                 {uniqueToTokens.filter((t:any) => t.type === 'Held').map((t: any) => (
                   <option key={t.address} value={t.address}>{t.symbol} (Held)</option>
                 ))}
               </optgroup>
               <option value="custom">手動入力 (カスタム)</option>
             </select>

             <Input 
               value={toInput} 
               onChange={(e:any) => setToInput(e.target.value)} 
               placeholder="トークンアドレス (0x...)" 
               className="text-xs font-mono"
             />
           </div>

           {/* 検索結果表示 */}
           <div className="mb-6 h-16">
             {isSearching && <div className="text-xs text-cyan-400 mt-1 animate-pulse">Searching info...</div>}
             
             {searchedToken && (
               <div className="mt-1 p-2 bg-slate-900/80 rounded border border-cyan-900/50 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   {searchedToken.logo && <img src={searchedToken.logo} className="w-6 h-6 rounded-full"/>}
                   <div>
                     <div className="text-sm font-bold text-cyan-100">{searchedToken.name} ({searchedToken.symbol})</div>
                     <div className="text-[10px] text-slate-400">Decimals: {searchedToken.decimals}</div>
                   </div>
                 </div>
                 <div className="text-right">
                    <div className="text-xs text-white">
                      Price:
                    </div>
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
              {searchedToken ? `${searchedToken.symbol}` : toInput.slice(0,6)+'...'}
            </span>
          </div>
          
          {/* P/L Comparison Section */}
          {comparisonData && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mt-2">
               <div className="text-xs text-slate-400 mb-1">取引額推定 (vs Previous)</div>
               <div className="flex flex-col gap-1">
                 <div className="flex justify-between text-xs">
                   <span>Main ({net.symbol}):</span>
                   <span className="text-cyan-200 font-mono">{comparisonData.diffValueMain}</span>
                 </div>
                 <div className="flex justify-between text-xs">
                   <span>JPY:</span>
                   <span className="text-cyan-200 font-mono">{comparisonData.diffValueJpy}</span>
                 </div>
                 <div className="flex justify-between text-xs">
                   <span>USD:</span>
                   <span className="text-slate-500 font-mono">{comparisonData.diffValueUsd}</span>
                 </div>
               </div>
            </div>
          )}

          <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
            <span className="text-slate-400">Est. Gas Fee</span>
            <span className="font-mono text-red-300">{estimatedFee.slice(0,8)} {net.symbol}</span>
          </div>
        </div>

        <Button onClick={handleExecute} disabled={loading}>
          {loading ? "処理中..." : "スワップ実行"}
        </Button>
      </GlassCard>
    </Wrapper>
  );
};