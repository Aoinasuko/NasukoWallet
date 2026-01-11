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
  
  // アカウントとネットワークでフィルタリング
  const myHistory = txHistory.filter(tx => {
    if (!wallet) return false;
    const myAddr = wallet.address.toLowerCase();
    const fromAddr = tx.from ? tx.from.toLowerCase() : "";
    const toAddr = tx.to ? tx.to.toLowerCase() : "";
    return fromAddr === myAddr || toAddr === myAddr;
  });

  return (
    <Wrapper title="取引履歴" backAction={() => setView('home')}>
      {lastUpdated && <div className="text-[10px] text-slate-500 text-right mb-2">最終更新: {lastUpdated}</div>}
      
      <div className="flex flex-col gap-3">
        {myHistory.length === 0 && (
          <div className="text-center mt-20">
            <p className="text-slate-500 text-sm mb-2">履歴はありません</p>
            <p className="text-[10px] text-slate-600">※反映に数分かかる場合があります</p>
          </div>
        )}
        
        {myHistory.map((item) => (
          <GlassCard key={item.id} className="p-4 relative group hover:border-cyan-500/40 transition">
            <div className="flex justify-between items-start mb-1">
              <div className={`font-bold text-sm flex items-center gap-1 ${item.type === 'receive' ? 'text-green-400' : 'text-cyan-50'}`}>
                {item.type === 'send' ? '↗ 送金' : '↙ 入金'}
              </div>
              <div className="text-[10px] text-slate-400">{item.date}</div>
            </div>
            
            <div className="text-lg font-bold text-white mb-1">
              {item.type === 'receive' ? '+' : '-'}{item.amount} <span className="text-sm font-normal text-cyan-200/70">{item.symbol}</span>
            </div>
            
            <div className="text-[10px] text-slate-500 mb-2">Network: {item.network}</div>
            
            <div className="flex gap-2 text-xs">
              <a href={`${allNetworks[networkKey]?.explorer}${item.hash}`} target="_blank" className="text-blue-400 hover:text-blue-300">Explorer ↗</a>
            </div>
          </GlassCard>
        ))}
      </div>
    </Wrapper>
  );
};