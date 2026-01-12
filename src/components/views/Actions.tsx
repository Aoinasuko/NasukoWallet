import { useState, useEffect } from 'react';
import * as QRCode from 'qrcode'; 
import { GlassCard, Button } from '../UI';
import { Wrapper } from '../Layout';

// Receive
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