import { GlassCard } from '../UI';
import { Wrapper } from '../Layout';
import type { TxHistory, NetworkConfig } from '../../types';

type Props = {
  wallet: any;
  networkKey: string;
  allNetworks: Record<string, NetworkConfig>;
  setView: (view: string) => void;
  txHistory: TxHistory[];
  setTxHistory: React.Dispatch<React.SetStateAction<TxHistory[]>>;
  lastUpdated: string | null;
};

export const HistoryView = ({ wallet, networkKey, allNetworks, setView, txHistory, lastUpdated }: Props) => {
  const myHistory = txHistory.filter(tx => {
    if (!wallet) return false;
    const myAddr = wallet.address.toLowerCase();
    const fromAddr = tx.from ? tx.from.toLowerCase() : "";
    const toAddr = tx.to ? tx.to.toLowerCase() : "";
    return fromAddr === myAddr || toAddr === myAddr;
  });

  // スワップ履歴のシンボル（ETH > USDC）を分割して表示するためのヘルパー
  const parseSwapSymbol = (symbol: string) => {
    if (symbol.includes('>')) {
      const [from, to] = symbol.split('>').map(s => s.trim());
      return { from, to };
    }
    return { from: symbol, to: '???' };
  };

  return (
    <Wrapper title="取引履歴" backAction={() => setView('home')}>
      {lastUpdated && <div className="text-[10px] text-slate-500 text-right mb-2">最終更新: {lastUpdated}</div>}
      
      <div className="flex flex-col gap-3">
        {myHistory.map((item) => {
          const isSwap = item.type === 'swap';
          const { from, to } = isSwap ? parseSwapSymbol(item.symbol) : { from: item.symbol, to: '' };

          return (
            <GlassCard key={item.id} className="p-4 relative group hover:border-cyan-500/40 transition">
              <div className="flex justify-between items-start mb-1">
                <div className={`font-bold text-sm flex items-center gap-1 
                  ${item.type === 'receive' ? 'text-green-400' : item.type === 'send' ? 'text-red-400' : 'text-purple-400'}`}>
                  {item.type === 'send' ? '↗ 送金' : item.type === 'receive' ? '↙ 入金' : '⇄ Swap'}
                </div>
                <div className="text-[10px] text-slate-400">{item.date}</div>
              </div>
              
              <div className="text-lg font-bold text-white mb-1">
                {/* スワップの場合: 送信額と受信額(あれば)を分けて表示 */}
                {isSwap ? (
                  <div className="flex flex-col">
                    <div className="text-red-300 text-base">
                      -{item.amount} <span className="text-xs font-normal text-red-200/70">{from}</span>
                    </div>
                    {/* ★修正: スワップ入手数を表示 */}
                    {item.receivedAmount && (
                      <div className="text-green-400 text-base">
                        +{item.receivedAmount} <span className="text-xs font-normal text-green-200/70">{to}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  // 通常の送受金
                  <div>
                    {item.type === 'receive' ? '+' : '-'}
                    {item.amount} <span className="text-sm font-normal text-cyan-200/70">{item.symbol}</span>
                  </div>
                )}
              </div>
              
              <div className="text-[10px] text-slate-500 mb-2">Network: {item.network}</div>
              <div className="flex gap-2 text-xs">
                <a href={`${allNetworks[networkKey]?.explorer}${item.hash}`} target="_blank" className="text-blue-400 hover:text-blue-300">Explorer ↗</a>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </Wrapper>
  );
};