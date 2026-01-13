import { useCallback, useEffect, useMemo, useState } from 'react';
import { GlassCard } from '../UI';
import { Wrapper } from '../Layout';
import type { TxHistory, NetworkConfig } from '../../types';
import { getBridgeStatus, statusToHistoryPatch } from '../../services/bridgeStatusService';

type Props = {
  wallet: any;
  networkKey: string;
  allNetworks: Record<string, NetworkConfig>;
  setView: (view: string) => void;
  txHistory: TxHistory[];
  setTxHistory: React.Dispatch<React.SetStateAction<TxHistory[]>>;
  lastUpdated: string | null;
};

export const HistoryView = ({ wallet, networkKey, allNetworks, setView, txHistory, setTxHistory, lastUpdated }: Props) => {
  const myHistory = useMemo(() => {
    return txHistory.filter(tx => {
      if (!wallet) return false;
      const myAddr = wallet.address.toLowerCase();
      const fromAddr = tx.from ? tx.from.toLowerCase() : "";
      const toAddr = tx.to ? tx.to.toLowerCase() : "";
      return fromAddr === myAddr || toAddr === myAddr;
    });
  }, [txHistory, wallet?.address]);
  const [statusLoadingIds, setStatusLoadingIds] = useState<Record<string, boolean>>({});

  const refreshOneBridge = useCallback(async (tx: TxHistory) => {
    if (!tx) return;
    const key = tx.id;
    setStatusLoadingIds(prev => ({ ...prev, [key]: true }));
    try {
      const s = await getBridgeStatus({
        txHashOrId: tx.hash || tx.lifiTransactionId || tx.lifiStepId || '',
        fromChain: tx.fromChainId || tx.fromNetworkKey,
        toChain: tx.toChainId || tx.toNetworkKey,
        bridgeTool: tx.bridgeTool,
        // API Key は src/apiConfig.ts (LIFI_API_KEY) から自動で参照されます
      });

      const patch = statusToHistoryPatch(s);
      setTxHistory(prev => prev.map(p => (p.id === tx.id ? { ...p, ...patch } : p)));
    } catch (e) {
      // ignore here; user can retry
      console.error(e);
    } finally {
      setStatusLoadingIds(prev => ({ ...prev, [key]: false }));
    }
  }, [setTxHistory]);

  // Auto refresh pending bridge transactions while this view is open
  useEffect(() => {
    const pending = myHistory.filter(t => t.type === 'bridge' && (t.bridgeStatus === 'PENDING' || !t.bridgeStatus));
    if (pending.length === 0) return;

    const id = setInterval(() => {
      pending.slice(0, 3).forEach((t) => refreshOneBridge(t));
    }, 20000);

    // refresh once immediately
    pending.slice(0, 3).forEach((t) => refreshOneBridge(t));

    return () => clearInterval(id);
  }, [myHistory, refreshOneBridge]);

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
                  ${item.type === 'receive' ? 'text-green-400' : item.type === 'send' ? 'text-red-400' : item.type === 'bridge' ? 'text-sky-400' : 'text-purple-400'}`}>
                  {item.type === 'send' ? '↗ 送金' : item.type === 'receive' ? '↙ 入金' : item.type === 'bridge' ? '⤴︎ Bridge' : '⇄ Swap'}
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
              
              <div className="text-[10px] text-slate-500 mb-2 space-y-1">
                <div>Network: {item.network}{item.type === 'bridge' && item.toNetwork ? ` → ${item.toNetwork}` : ''}</div>
                {item.type === 'bridge' && (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded border border-slate-600 text-[10px] text-slate-200">
                      Status: {item.bridgeStatus || 'PENDING'}
                      {item.bridgeSubstatus ? ` / ${item.bridgeSubstatus}` : ''}
                    </span>
                    {item.bridgeSubstatusMessage && (
                      <span className="text-[10px] text-slate-400">{item.bridgeSubstatusMessage}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs items-center">
                {/* Source chain explorer */}
                <a
                  href={`${allNetworks[item.fromNetworkKey || networkKey]?.explorer}${item.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Source Tx ↗
                </a>

                {/* Destination tx link (if known) */}
                {item.type === 'bridge' && item.receivingTxLink && (
                  <a href={item.receivingTxLink} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                    Dest Tx ↗
                  </a>
                )}

                {/* LI.FI explorer */}
                {item.type === 'bridge' && item.lifiExplorerLink && (
                  <a href={item.lifiExplorerLink} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">
                    LI.FI Scan ↗
                  </a>
                )}

                {item.type === 'bridge' && (
                  <button
                    className="ml-auto px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 disabled:opacity-50"
                    disabled={!!statusLoadingIds[item.id]}
                    onClick={() => refreshOneBridge(item)}
                    title="LI.FIのステータスを再取得します"
                  >
                    {statusLoadingIds[item.id] ? '更新中...' : 'ステータス更新'}
                  </button>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </Wrapper>
  );
};