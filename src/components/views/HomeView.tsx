import { useState } from 'react';
import { GlassCard, Button, SmartIcon } from '../UI';
import { Wrapper } from '../Layout';
import type { TokenData, NftData, NetworkConfig } from '../../types';

type Props = {
  wallet: any;
  balance: string;
  networkKey: string;
  allNetworks: Record<string, NetworkConfig>;
  // ★型を修正: 変動率も受け取る
  currentPrice: { usd: number, jpy: number, usdChange: number, jpyChange: number } | null;
  currency: 'JPY' | 'USD';
  onSetCurrency: () => void;
  tokenList: TokenData[];
  nftList: NftData[];
  isAssetLoading: boolean;
  onChangeNetwork: (key: string) => void;
  setView: (view: string) => void;
  onLogout: () => void;
  bgImage: string | null;
};

export const HomeView = ({ 
  wallet, balance, networkKey, allNetworks, currentPrice, currency, onSetCurrency,
  tokenList, nftList, isAssetLoading, onChangeNetwork, setView, onLogout, bgImage 
}: Props) => {
  const [assetTab, setAssetTab] = useState<'tokens' | 'nfts'>('tokens');
  const currentNet = allNetworks[networkKey];

  // メイン通貨の価格と変動率を決定
  const mainPrice = currentPrice ? (currency === 'JPY' ? currentPrice.jpy : currentPrice.usd) : 0;
  const mainChange = currentPrice ? (currency === 'JPY' ? currentPrice.jpyChange : currentPrice.usdChange) : 0;
  
  // メイン通貨の評価額
  const mainValue = parseFloat(balance) * mainPrice;

  // 通貨記号
  const sym = currency === 'JPY' ? '¥' : '$';

  return (
    <Wrapper bgImage={bgImage} currentNetwork={networkKey} allNetworks={allNetworks} onNetworkChange={onChangeNetwork} onViewSettings={() => setView('settings_menu')}>
      <div className="flex flex-col items-center mt-6 mb-6">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative w-20 h-20 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center shadow-xl p-1">
             <SmartIcon src={currentNet.logo} symbol={currentNet.symbol} className="w-full h-full rounded-full object-cover" />
          </div>
        </div>
        <div className="mt-4 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg">{parseFloat(balance).toFixed(4)} <span className="text-lg text-cyan-400">{currentNet.symbol}</span></h2>
          
          {/* ★修正: 価格と変動率の表示 */}
          {currentPrice ? (
            <div className="flex flex-col items-center mt-1">
              <button onClick={onSetCurrency} className="text-cyan-200/80 font-medium text-sm bg-slate-950/40 px-3 py-1 rounded-full backdrop-blur-sm border border-white/5 cursor-pointer hover:bg-slate-950/60 active:scale-95 transition">
                ≈ {sym}{mainValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
              </button>
              <div className={`text-xs mt-1 font-bold ${mainChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {mainChange >= 0 ? '▲' : '▼'} {Math.abs(mainChange).toFixed(2)}% (24h)
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 mt-2">Price not available</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-6 px-2">
        {[{ label: '送金', icon: '↑', action: () => setView('send') }, { label: '入金', icon: '↓', action: () => setView('receive') }, { label: '取引', icon: '⇄', action: () => setView('swap') }, { label: '履歴', icon: '🕒', action: () => setView('history') }].map(btn => (
          <button key={btn.label} onClick={btn.action} className="flex flex-col items-center gap-2 group p-2 rounded-xl hover:bg-white/5 transition">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg text-lg text-white group-hover:scale-110 transition">{btn.icon}</div>
            <span className="text-[10px] font-medium text-cyan-100/70">{btn.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-slate-900/60 backdrop-blur-md rounded-t-2xl border-t border-l border-r border-cyan-500/20 flex-1 min-h-[300px] shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex border-b border-white/5">
          <button onClick={() => setAssetTab('tokens')} className={`flex-1 py-3 text-sm font-bold transition ${assetTab === 'tokens' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-900/10' : 'text-slate-500 hover:text-slate-300'}`}>トークン</button>
          <button onClick={() => setAssetTab('nfts')} className={`flex-1 py-3 text-sm font-bold transition ${assetTab === 'nfts' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-900/10' : 'text-slate-500 hover:text-slate-300'}`}>NFTs</button>
        </div>
        <div className="p-4">
          {isAssetLoading && <div className="text-center text-xs text-slate-400 py-4 animate-pulse">Loading Assets...</div>}
          
          {!isAssetLoading && assetTab === 'tokens' && (
            <div className="flex flex-col gap-3">
              {/* Native Token */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 p-1"><SmartIcon src={currentNet.logo} symbol={currentNet.symbol} className="w-full h-full object-contain" /></div>
                  <div><div className="font-bold text-sm text-cyan-50">{currentNet.symbol}</div><div className="text-[10px] text-slate-400">Native</div></div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-cyan-50">{parseFloat(balance).toFixed(4)}</div>
                  <div className="text-[10px] text-slate-400">≈ {sym}{mainValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                </div>
              </div>
              
              {/* Fetched Tokens */}
              {tokenList.map((token, i) => {
                // 通貨に応じたデータを取得
                const market = token.market ? (currency === 'JPY' ? token.market.jpy : token.market.usd) : null;
                const value = market ? parseFloat(token.balance) * market.price : 0;

                return (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 p-1"><SmartIcon src={token.logo} symbol={token.symbol} className="w-full h-full object-contain" /></div>
                      <div><div className="font-bold text-sm text-cyan-50">{token.symbol}</div><div className="text-[10px] text-slate-400">{token.name}</div></div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-cyan-50">{parseFloat(token.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                      {market ? (
                        <div className="flex flex-col items-end">
                          <div className="text-[10px] text-slate-400">≈ {sym}{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                          <div className={`text-[9px] ${market.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {market.change >= 0 ? '▲' : '▼'} {Math.abs(market.change).toFixed(2)}%
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-600">---</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {tokenList.length === 0 && <div className="text-center text-[10px] text-slate-600 mt-2">No other tokens found</div>}
            </div>
          )}

          {!isAssetLoading && assetTab === 'nfts' && (
            <div className="grid grid-cols-2 gap-3">
              {nftList.map((nft, i) => (
                <div key={i} className="bg-slate-800/40 rounded-xl overflow-hidden hover:bg-slate-800/60 transition cursor-pointer group">
                  <div className="h-28 w-full bg-slate-700 relative">
                    <img src={nft.image} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" onError={(e:any) => e.target.src='https://via.placeholder.com/150?text=No+Img'} />
                  </div>
                  <div className="p-3"><div className="font-bold text-xs text-cyan-50 truncate">{nft.name}</div><div className="text-[10px] text-slate-400 truncate">{nft.collectionName}</div></div>
                </div>
              ))}
              {nftList.length === 0 && <div className="col-span-2 text-center text-[10px] text-slate-600 mt-4">No NFTs found</div>}
            </div>
          )}
        </div>
      </div>

      <GlassCard className="mb-4 !p-3 mt-4">
        <p className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-1 font-bold">Account</p>
        <div className="flex justify-between items-center bg-slate-950/50 border border-slate-700/50 p-2 rounded-lg cursor-pointer hover:border-cyan-500/50 transition group" onClick={() => {navigator.clipboard.writeText(wallet.address); alert("Copied!")}}>
           <code className="text-xs text-cyan-100 font-mono">{wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}</code>
           <span className="text-xs text-slate-500 group-hover:text-cyan-400 transition">📋</span>
        </div>
      </GlassCard>
      <Button variant="secondary" onClick={onLogout}>ログアウト</Button>
    </Wrapper>
  );
};