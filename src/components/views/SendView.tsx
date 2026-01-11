import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { GlassCard, Input, Button } from '../UI';
import { Wrapper } from '../Layout';
import type { NetworkConfig, SavedAccount, TxHistory } from '../../types';

type Props = {
  wallet: any;
  balance: string;
  networkKey: string;
  allNetworks: Record<string, NetworkConfig>;
  savedAccounts: SavedAccount[];
  setView: (view: string) => void;
  onTxComplete: (tx: TxHistory) => void;
  updateBalance: () => void;
};

export const SendView = ({ wallet, balance, networkKey, allNetworks, savedAccounts, setView, onTxComplete, updateBalance }: Props) => {
  // ★Sendに関するStateはここに移動！
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // 見積もり用
  const [gasFee, setGasFee] = useState('0');
  const [totalCost, setTotalCost] = useState('0');
  const [balanceAfter, setBalanceAfter] = useState('0');
  const [isBalanceSufficient, setIsBalanceSufficient] = useState(true);

  // 見積もり自動更新
  useEffect(() => {
    let intervalId: any;
    if (step === 'confirm' && wallet) {
      updateEstimates();
      intervalId = setInterval(updateEstimates, 15000);
    }
    return () => clearInterval(intervalId);
  }, [step, wallet, sendAmount]);

  const updateEstimates = async () => {
    if (!wallet) return;
    try {
      const provider = wallet.provider; if (!provider) return;
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;
      const estimatedFeeWei = gasPrice * 21000n;
      const currentBalWei = ethers.parseEther(balance);
      const sendAmountWei = ethers.parseEther(sendAmount || '0');
      const totalWei = sendAmountWei + estimatedFeeWei;
      const remainWei = currentBalWei - totalWei;
      
      setGasFee(ethers.formatEther(estimatedFeeWei));
      setTotalCost(ethers.formatEther(totalWei));
      if (remainWei < 0n) { setBalanceAfter("不足"); setIsBalanceSufficient(false); }
      else { setBalanceAfter(ethers.formatEther(remainWei)); setIsBalanceSufficient(true); }
    } catch (e) { console.error(e); }
  };

  const handleConfirm = () => {
    if (!sendTo) return setMsg("宛先アドレスを入力してください");
    if (!sendAmount) return setMsg("送金額を入力してください");
    if (!ethers.isAddress(sendTo)) return setMsg("無効なアドレス形式です");
    setMsg("");
    setStep('confirm');
  };

  const handleSendExecute = async () => {
    if (!wallet) return;
    setLoading(true); setMsg("送金処理中...");
    try {
      const tx = await wallet.sendTransaction({ to: sendTo, value: ethers.parseEther(sendAmount) });
      const currentNet = allNetworks[networkKey];
      const newTx: TxHistory = { 
        id: Date.now().toString(), hash: tx.hash, type: 'send', amount: sendAmount, 
        symbol: currentNet.symbol, from: wallet.address, to: sendTo, date: new Date().toLocaleString(), network: currentNet.name 
      };
      
      // 親コンポーネントに通知
      onTxComplete(newTx);
      updateBalance();
      alert(`送金完了！\nHash: ${tx.hash.slice(0, 10)}...`);
      setView('home');
    } catch (e: any) { setMsg("送金失敗: " + (e.message || "不明なエラー")); } finally { setLoading(false); }
  };

  if (step === 'confirm') return (
    <Wrapper title="内容確認" backAction={() => setStep('input')}>
      <GlassCard>
        <h3 className="text-md font-bold text-center mb-6 text-cyan-50">送金シミュレーション</h3>
        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-xs text-slate-400">現在の残高</span><span className="font-mono text-sm">{parseFloat(balance).toFixed(6)} {allNetworks[networkKey].symbol}</span></div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-xs text-cyan-300">送金額</span><span className="font-mono text-sm font-bold text-cyan-300">- {sendAmount} {allNetworks[networkKey].symbol}</span></div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-xs text-yellow-300">手数料 (見込み)</span><div className="text-right"><span className="font-mono text-sm text-yellow-300 block">- {parseFloat(gasFee).toFixed(6)} {allNetworks[networkKey].symbol}</span><span className="text-[9px] text-slate-500">15秒ごとに更新</span></div></div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2"><span className="text-xs text-slate-400">合計支払い額</span><span className="font-mono text-sm text-slate-200">- {parseFloat(totalCost).toFixed(6)} {allNetworks[networkKey].symbol}</span></div>
          <div className="flex justify-between items-center pt-2"><span className="text-xs text-slate-200 font-bold">処理後の残高</span><span className={`font-mono text-sm font-bold ${isBalanceSufficient ? 'text-green-400' : 'text-red-500'}`}>{isBalanceSufficient ? parseFloat(balanceAfter).toFixed(6) : "残高不足"} {allNetworks[networkKey].symbol}</span></div>
        </div>
        {!isBalanceSufficient && <p className="text-red-400 text-xs text-center mb-4 bg-red-950/30 p-2 rounded border border-red-900/50">※手数料を含めると残高が足りません。</p>}
        {msg && <p className="text-slate-400 text-xs text-center mb-2">{msg}</p>}
        <Button onClick={handleSendExecute} disabled={!isBalanceSufficient || loading}>{loading ? "送信中..." : "確定して送金"}</Button>
      </GlassCard>
    </Wrapper>
  );

  return (
    <Wrapper title="送金" backAction={() => setView('home')}>
      <GlassCard>
        <p className="mb-2 text-xs font-bold text-cyan-200/70 uppercase">宛先アドレス</p>
        <Input placeholder="0x..." value={sendTo} onChange={(e:any) => setSendTo(e.target.value)} />
        {savedAccounts.length > 1 && (
          <div className="mb-3 overflow-x-auto custom-scrollbar pb-1">
            <div className="flex gap-2">
              <span className="text-[10px] text-slate-500 whitespace-nowrap pt-1">自分の口座:</span>
              {savedAccounts.filter(acc => acc.address !== wallet?.address).map(acc => (
                <button key={acc.address} onClick={() => setSendTo(acc.address)} className="text-[10px] bg-slate-800 border border-slate-600 px-2 py-1 rounded-full hover:bg-cyan-900/50 hover:text-cyan-200 hover:border-cyan-500/50 transition whitespace-nowrap">{acc.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-between items-end mb-2">
          <p className="text-xs font-bold text-cyan-200/70 uppercase">送金額 ({allNetworks[networkKey].symbol})</p>
          <div className="text-xs text-cyan-400 cursor-pointer hover:text-white hover:underline transition" onClick={() => setSendAmount(balance)} title="クリックで全額入力">保有残高: {parseFloat(balance).toFixed(6)}</div>
        </div>
        <Input placeholder="0.0" type="number" value={sendAmount} onChange={(e:any) => setSendAmount(e.target.value)} />
        {msg && <p className="text-red-400 text-xs mb-4 text-center bg-red-900/20 p-2 rounded border border-red-900/30">{msg}</p>}
        <Button onClick={handleConfirm}>確認画面へ</Button>
      </GlassCard>
    </Wrapper>
  );
};