// src/components/views/Auth.tsx
import { useState } from 'react';
import * as QRCode from 'qrcode'; 
import { GlassCard, Input, Button } from '../UI';
import { Wrapper } from '../Layout';
import { generateTotpSecret, getTotpUri } from '../../cryptoUtils';

// 1. Welcome (Setup)
export const WelcomeView = ({ onStartSetup }: { onStartSetup: (pass: string, secret: any, qr: string) => void }) => {
  const [pass, setPass] = useState('');
  
  const handleStart = async () => {
    if (!pass) return alert("パスワードを入力してください");
    const s = generateTotpSecret();
    const qr = await QRCode.toDataURL(getTotpUri(s, 'NasukoWallet'));
    onStartSetup(pass, s, qr);
  };

  return (
    <Wrapper title="Welcome">
      <GlassCard className="text-center">
        <div className="text-4xl mb-4">💎</div>
        <h2 className="text-xl font-bold text-cyan-100 mb-2">NasukoWallet</h2>
        <p className="mb-6 text-sm text-cyan-200/70">Secure & Simple.</p>
        <Input type="password" placeholder="マスターパスワードを設定" value={pass} onChange={(e:any) => setPass(e.target.value)} />
        <Button onClick={handleStart}>はじめる</Button>
      </GlassCard>
    </Wrapper>
  );
};

// 2. 2FA Setup
export const Setup2FAView = ({ qrUrl, onFinishSetup }: { qrUrl: string, onFinishSetup: (code: string) => void }) => {
  const [code, setCode] = useState('');
  return (
    <Wrapper title="2FA設定">
      <GlassCard>
        <p className="mb-4 text-sm text-cyan-200/80">Google Authenticator等のアプリで<br/>QRコードをスキャンしてください。</p>
        <div className="bg-white p-3 rounded-xl mb-4 flex justify-center">{qrUrl && <img src={qrUrl} width={150} />}</div>
        <Input placeholder="6桁の認証コード" value={code} onChange={(e:any) => setCode(e.target.value)} />
        <Button onClick={() => onFinishSetup(code)}>設定完了</Button>
      </GlassCard>
    </Wrapper>
  );
};

// 3. Login
export const LoginView = ({ onLogin, loading }: { onLogin: (pass: string, code: string) => void, loading: boolean }) => {
  const [pass, setPass] = useState('');
  const [code, setCode] = useState('');

  return (
    <Wrapper title="ロック解除">
      <GlassCard>
        <div className="mb-6 text-center">
          <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-3xl">🔒</div>
        </div>
        <Input type="password" placeholder="マスターパスワード" value={pass} onChange={(e:any) => setPass(e.target.value)} />
        <Input placeholder="2FAコード (6桁)" value={code} onChange={(e:any) => setCode(e.target.value)} />
        <Button onClick={() => onLogin(pass, code)} disabled={loading}>{loading ? "認証中..." : "解除"}</Button>
      </GlassCard>
    </Wrapper>
  );
};