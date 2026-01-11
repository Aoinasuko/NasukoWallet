// src/components/views/Actions.tsx
import { useState, useEffect } from 'react';
import * as QRCode from 'qrcode'; 
import { GlassCard, Button } from '../UI';
import { Wrapper } from '../Layout';
import { DEX_URLS } from '../../constants';

// 1. Receive
export const ReceiveView = ({ address, setView }: any) => {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(address).then(setQr); }, [address]);

  return (
    <Wrapper title="入金" backAction={() => setView('home')}>
      <GlassCard className="flex flex-col items-center">
        <p className="text-cyan-200/80 mb-4 text-sm">QRコードをスキャン</p>
        <div className="bg-white p-4 rounded-xl mb-6 shadow-inner">{qr && <img src={qr} width={180} alt="QR" />}</div>
        <div className="bg-slate-950/50 border border-slate-700/50 p-3 rounded-xl break-all text-center font-mono text-xs text-cyan-100 w-full mb-4">{address}</div>
        <Button onClick={() => {navigator.clipboard.writeText(address); alert("コピーしました")}} variant="secondary">アドレスをコピー</Button>
      </GlassCard>
    </Wrapper>
  );
};

// 2. Swap
export const SwapView = ({ networkName, networkKey, setView }: any) => (
  <Wrapper title="取引" backAction={() => setView('home')}>
    <GlassCard>
      <div className="text-center mb-6"><div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto text-3xl">⇄</div></div>
      <h3 className="text-lg font-bold text-center mb-2">DEXで取引</h3>
      <p className="text-sm text-slate-400 text-center mb-8">安全のため外部DEXを使用します。<br/>{networkName}対応の取引所を開きます。</p>
      <a href={DEX_URLS[networkKey] || "https://app.uniswap.org/"} target="_blank" rel="noopener noreferrer">
        <Button>DEXを開く ({networkName})</Button>
      </a>
    </GlassCard>
  </Wrapper>
);