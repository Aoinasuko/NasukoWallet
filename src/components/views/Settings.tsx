// src/components/views/Settings.tsx
import { useState } from 'react';
import { GlassCard, Input, Button, SmartIcon } from '../UI';
import { Wrapper } from '../Layout';

// 1. Menu
export const SettingsMenuView = ({ setView }: any) => (
  <Wrapper title="設定" backAction={() => setView('home')}>
    <div className="flex flex-col gap-3">
      {[
        { id: 'settings_network_list', icon: '🌐', title: 'ネットワーク設定', desc: 'RPCの追加・編集' },
        { id: 'settings_account', icon: '🔐', title: 'アカウント設定', desc: '秘密鍵の確認' },
        { id: 'settings_general', icon: '🎨', title: '一般設定', desc: '背景画像の変更' },
      ].map((item) => (
        <GlassCard key={item.id} className="cursor-pointer hover:bg-cyan-900/10 hover:border-cyan-500/30 transition group">
          <div onClick={() => setView(item.id)} className="flex items-center gap-4">
            <span className="text-2xl group-hover:scale-110 transition">{item.icon}</span>
            <div><h3 className="font-bold text-cyan-50">{item.title}</h3><p className="text-xs text-slate-400">{item.desc}</p></div>
          </div>
        </GlassCard>
      ))}
    </div>
  </Wrapper>
);

// 2. Account Settings
export const SettingsAccountView = ({ privateKey, setView }: any) => {
  const [show, setShow] = useState(false);
  return (
    <Wrapper title="アカウント設定" backAction={() => setView('settings_menu')}>
      <GlassCard>
        <h3 className="font-bold mb-2 text-red-400 text-sm uppercase">秘密鍵の表示</h3>
        {show ? (
          <div className="bg-slate-950 p-3 rounded border border-red-900/50 mb-4 break-all font-mono text-xs text-red-300 shadow-inner">{privateKey}</div>
        ) : (
          <div className="h-20 bg-slate-950/50 rounded flex items-center justify-center mb-4 text-slate-600 text-sm tracking-widest border border-slate-800">●●●●●●●●</div>
        )}
        <Button variant={show ? "secondary" : "primary"} onClick={() => setShow(!show)}>{show ? "隠す" : "表示する"}</Button>
      </GlassCard>
    </Wrapper>
  );
};

// 3. General Settings
export const SettingsGeneralView = ({ bgImage, onSetBg, mainNetwork, onSetMainNetwork, allNetworks, setView }: any) => {
  const onChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2000000) return alert("サイズが大きすぎます(2MB以下)");
      const r = new FileReader();
      r.onload = (ev) => onSetBg(ev.target?.result as string);
      r.readAsDataURL(file);
    }
  };
  return (
    <Wrapper title="一般設定" backAction={() => setView('settings_menu')}>
      <GlassCard className="mb-4">
        <h3 className="font-bold mb-2 text-cyan-100">メイン通貨(ネットワーク)決定</h3>
        <p className="text-xs text-slate-400 mb-2">損益計算の基準となるネットワークを選択します。</p>
        <select
          value={mainNetwork || 'mainnet'}
          onChange={(e) => onSetMainNetwork(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white"
        >
          {Object.entries(allNetworks).map(([key, net]: any) => (
            <option key={key} value={key}>{net.name} ({net.symbol})</option>
          ))}
        </select>
      </GlassCard>

      <GlassCard>
        <h3 className="font-bold mb-4 text-cyan-100">背景画像の設定</h3>
        {bgImage ? (
          <div className="mb-4"><img src={bgImage} className="w-full h-32 object-cover rounded-lg border border-slate-600" /><div className="mt-4"><Button variant="secondary" onClick={() => onSetBg(null)}>リセット</Button></div></div>
        ) : (
          <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-cyan-500/50 transition bg-slate-950/30">
            <p className="text-xs text-slate-400 mb-3">画像をアップロード</p>
            <input type="file" accept="image/*" onChange={onChange} className="text-xs text-slate-500" />
          </div>
        )}
      </GlassCard>
    </Wrapper>
  );
};

// 4. Network List
export const SettingsNetworkListView = ({ allNetworks, onDelete, setView }: any) => (
  <Wrapper title="ネットワーク" backAction={() => setView('settings_menu')}>
    <div className="flex flex-col gap-2 mb-4">
      {Object.entries(allNetworks).map(([key, net]: any) => (
        <div key={key} className="bg-slate-900/50 border border-slate-700/50 p-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SmartIcon src={net.logo} symbol={net.symbol} className="w-6 h-6 rounded-full" />
            <div><div className="text-xs font-bold text-cyan-100">{net.name}</div><div className="text-[9px] text-slate-500">ID: {net.chainId}</div></div>
          </div>
          {net.isCustom && <button onClick={(e) => { e.stopPropagation(); onDelete(key); }} className="text-slate-500 hover:text-red-400 text-sm p-2">✕</button>}
        </div>
      ))}
    </div>
    <Button onClick={() => setView('settings_network_add')}>+ ネットワークを追加</Button>
  </Wrapper>
);

// 5. Network Add
export const SettingsNetworkAddView = ({ onAdd, setView }: any) => {
  const [form, setForm] = useState({ name: '', rpc: '', id: '', symbol: '', explorer: '', logo: '' });
  
  const handleSymbol = (e: any) => {
    const val = e.target.value;
    setForm(p => ({ ...p, symbol: val, logo: val.length >= 2 ? `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${val.toLowerCase()}.png` : '' }));
  };

  const handleSubmit = () => {
    if(!form.name || !form.rpc || !form.id || !form.symbol) return alert("必須項目を入力してください");
    onAdd(form);
  };

  return (
    <Wrapper title="ネットワーク追加" backAction={() => setView('settings_network_list')}>
      <GlassCard>
        <p className="text-xs text-slate-400 mb-1">ネットワーク名</p><Input value={form.name} onChange={(e:any) => setForm({...form, name:e.target.value})} placeholder="My Network" />
        <p className="text-xs text-slate-400 mb-1">RPC URL</p><Input value={form.rpc} onChange={(e:any) => setForm({...form, rpc:e.target.value})} placeholder="https://..." />
        <p className="text-xs text-slate-400 mb-1">チェーンID</p><Input value={form.id} onChange={(e:any) => setForm({...form, id:e.target.value})} placeholder="1234" />
        <p className="text-xs text-slate-400 mb-1">通貨シンボル</p><Input value={form.symbol} onChange={handleSymbol} placeholder="ETH" />
        {form.logo && <div className="flex items-center gap-2 mb-3 bg-slate-900/50 p-2 rounded-lg"><span className="text-[10px] text-slate-400">プレビュー:</span><SmartIcon src={form.logo} symbol={form.symbol} className="w-5 h-5 rounded-full" /></div>}
        <p className="text-xs text-slate-400 mb-1">Explorer URL</p><Input value={form.explorer} onChange={(e:any) => setForm({...form, explorer:e.target.value})} placeholder="https://..." />
        <Button onClick={handleSubmit}>追加する</Button>
      </GlassCard>
    </Wrapper>
  );
};