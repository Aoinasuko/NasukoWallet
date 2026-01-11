import { useState, useEffect, useMemo } from 'react';

// --- アイコン取得ロジック ---
const getIconSources = (symbol: string, address?: string) => {
  if (!symbol) return [];
  const s = symbol.toLowerCase();
  
  // URLのパスエンコード処理（記号対策）
  const safeS = encodeURIComponent(s);

  return [
    // 1. SpotHQ (一般的な暗号資産)
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${safeS}.png`,
    // 2. TrustWallet Assets (ブロックチェーン系)
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${nameToTrustWalletChain(s)}/info/logo.png`,
    // 3. CoinGecko (推測)
    `https://assets.coingecko.com/coins/images/1/large/${safeS}.png`, 
    // 4. 一般的なトークンロゴ (Uniswapなど)
    address ? `https://raw.githubusercontent.com/uniswap/assets/master/blockchains/ethereum/assets/${address}/logo.png` : '',
    // 5. バリエーション
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s === 'pol' ? 'matic' : safeS}.png`,
  ].filter(url => url !== ''); // 空文字を除去
};

// シンボル名をTrustWalletのチェーン名に変換するヘルパー
const nameToTrustWalletChain = (symbol: string) => {
  const map: Record<string, string> = {
    eth: 'ethereum', bnb: 'binance', matic: 'polygon', pol: 'polygon',
    avax: 'avalanchec', hbar: 'hedera', sol: 'solana', op: 'optimism',
    arb: 'arbitrum', astr: 'astar'
  };
  return map[symbol] || symbol;
};

// ★修正: 賢いアイコンコンポーネント
export const SmartIcon = ({ src, symbol, address, className, alt }: any) => {
  // 1. 候補リストを生成 (srcやsymbolが変わるたびに再計算)
  const sources = useMemo(() => {
    const list = src ? [src] : [];
    if (symbol) list.push(...getIconSources(symbol, address));
    // 最後にプレースホルダー
    list.push(`https://via.placeholder.com/64/334155/FFFFFF?text=${symbol ? symbol[0].toUpperCase() : '?'}`);
    return list;
  }, [src, symbol, address]);

  // 2. 現在表示しているインデックス
  const [currentSrcIndex, setCurrentSrcIndex] = useState(0);

  // ★重要: ネットワークが変わったら（sourcesが変わったら）インデックスをリセット
  useEffect(() => {
    setCurrentSrcIndex(0);
  }, [sources]);

  const handleError = () => {
    // 次のソースがあれば切り替える
    if (currentSrcIndex < sources.length - 1) {
      setCurrentSrcIndex(prev => prev + 1);
    }
  };

  return (
    <img 
      src={sources[currentSrcIndex]} 
      alt={alt || symbol} 
      className={className} 
      onError={handleError}
    />
  );
};

// --- 以下、既存のコンポーネント (変更なし) ---

export const GlassCard = ({ children, className, onClick }: any) => (
  <div onClick={onClick} className={`bg-slate-900/60 backdrop-blur-md border border-cyan-500/20 rounded-2xl p-5 shadow-lg shadow-black/20 ${className}`}>
    {children}
  </div>
);

export const Input = (props: any) => (
  <input {...props} className="w-full bg-slate-950/60 border border-slate-700/60 rounded-xl p-3 text-sm text-cyan-50 placeholder-slate-500 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition mb-3" />
);

export const Button = ({ children, onClick, disabled, variant = 'primary', className }: any) => {
  const base = "w-full py-3 rounded-xl font-bold transition duration-200 shadow-md flex justify-center items-center gap-2 ";
  const styles = variant === 'primary' 
    ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:grayscale"
    : "bg-slate-800/80 hover:bg-slate-700 text-cyan-100 border border-slate-700";
  return <button onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className} disabled:opacity-50`} >{children}</button>;
};