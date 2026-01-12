import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input} from '../UI';
import { executeSwap } from '../../services/swapService';
import { fetchTokenMetadataAndPrice } from '../../alchemy'; // ★追加
import { UNISWAP_ADDRESSES } from '../../constants';
import type { TxHistory, TokenData } from '../../types';

// 主要トークンのリスト (シンボルと名称)
const MAJOR_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'USDT', name: 'Tether USD' },
  { symbol: 'WBTC', name: 'Wrapped BTC' },
  { symbol: 'DAI', name: 'Dai Stablecoin' },
  { symbol: 'UNI', name: 'Uniswap' },
  { symbol: 'MATIC', name: 'Polygon' } // または POL
];

export const SwapView = ({ networkKey, allNetworks, wallet, tokenList, setView, onSwap }: any) => {
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
      
      // 既知のアドレス(主要トークン)なら検索不要だが、価格表示のために検索してもよい
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

  // Helper: トークン選択 (To - プリセット選択時)
  const handleSelectToPreset = (address: string) => {
    setToInput(address);
  };

  // プリセットリスト作成 (主要 + 所持)
  // アドレスがわかるものだけフィルタリング (UNISWAP_ADDRESSES等から補完が必要だが簡易的に実装)
  const availableToTokens = [
     // 主要トークン (定数からアドレス解決できるもの)
     ...MAJOR_TOKENS.map(t => {
         // UNISWAP_ADDRESSES にあるかチェック (USDC, MATIC等)
         const key = t.symbol as keyof typeof addresses;
         const addr = addresses && addresses[key] ? addresses[key] : null;
         return addr ? { symbol: t.symbol, address: addr, type: 'Major' } : null;
     }).filter(Boolean),
     // 所持トークン
     ...tokenList.map((t: TokenData) => ({ symbol: t.symbol, address: t.address, type: 'Held' }))
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
      setStep('confirm');
    } catch(e) { console.error(e); }
    setLoading(false);
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

           {/* TO SECTION */}
           <p className="text-xs text-slate-400 mb-1">交換先 (リスト選択 または アドレス入力)</p>
           
           {/* 1. プリセット選択ボタン */}
           <div className="flex flex-wrap gap-2 mb-3">
             {uniqueToTokens.map((t: any) => (
               <button 
                 key={t.address}
                 onClick={() => handleSelectToPreset(t.address)}
                 className={`px-2 py-1 rounded text-xs border ${toInput === t.address ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-cyan-500'}`}
               >
                 {t.symbol}
               </button>
             ))}
           </div>

           {/* 2. アドレス入力 & 検索結果 */}
           <div className="mb-6">
             <Input 
               value={toInput} 
               onChange={(e:any) => setToInput(e.target.value)} 
               placeholder="トークンアドレス (0x...)" 
               className="text-xs font-mono"
             />
             
             {isSearching && <div className="text-xs text-cyan-400 mt-1 animate-pulse">Searching info...</div>}
             
             {searchedToken && (
               <div className="mt-2 p-2 bg-slate-900/80 rounded border border-cyan-900/50 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   {searchedToken.logo && <img src={searchedToken.logo} className="w-6 h-6 rounded-full"/>}
                   <div>
                     <div className="text-sm font-bold text-cyan-100">{searchedToken.name} ({searchedToken.symbol})</div>
                     <div className="text-[10px] text-slate-400">Decimals: {searchedToken.decimals}</div>
                   </div>
                 </div>
                 <div className="text-right">
                    <div className="text-xs text-white">
                      1 {searchedToken.symbol} = 
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ${searchedToken.price.usd} / ¥{searchedToken.price.jpy}
                    </div>
                 </div>
               </div>
             )}
             
             {!isSearching && toInput && !searchedToken && ethers.isAddress(toInput) && (
                <div className="text-xs text-red-400 mt-1">トークン情報が見つかりません</div>
             )}
           </div>

           <Button onClick={handleProceed} disabled={loading || !amount || !toInput}>
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
              {searchedToken ? `${searchedToken.symbol} (${searchedToken.name})` : toInput.slice(0,6)+'...'}
            </span>
          </div>
          {searchedToken && (
            <div className="text-right text-[10px] text-slate-500">
               参考レート: 1 Token ≈ ¥{searchedToken.price.jpy}
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