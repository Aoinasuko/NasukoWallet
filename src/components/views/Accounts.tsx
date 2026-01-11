// src/components/views/Accounts.tsx
import { useState } from 'react';
import { GlassCard, Input, Button } from '../UI';
import { Wrapper } from '../Layout';
import type { SavedAccount } from '../../types';

// 1. Account List
type ListProps = {
  accounts: SavedAccount[];
  onUnlock: (acc: SavedAccount) => void;
  onDelete: (addr: string) => void;
  onAdd: () => void;
};

export const AccountListView = ({ accounts, onUnlock, onDelete, onAdd }: ListProps) => {
  return (
    <Wrapper title="アカウント選択">
      <div className="flex flex-col gap-3">
        {accounts.map((acc) => (
          <div key={acc.address} onClick={() => onUnlock(acc)} className="group bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl cursor-pointer hover:bg-cyan-900/10 hover:border-cyan-500/50 transition flex justify-between items-center">
            <div>
              <div className="font-bold text-cyan-50">{acc.name}</div>
              <div className="text-xs text-slate-400 font-mono">{acc.address.slice(0, 8)}...</div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={(e) => { e.stopPropagation(); onDelete(acc.address); }} className="p-2 text-slate-600 hover:text-red-400 transition z-10 hover:bg-red-950/30 rounded-full">🗑️</button>
              <span className="text-slate-600 group-hover:text-cyan-400 transition">→</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6"><Button onClick={onAdd}>+ アカウント追加</Button></div>
    </Wrapper>
  );
};

// 2. Import
export const ImportView = ({ onImport, onCancel }: { onImport: (type: 'json'|'privateKey', val: string, pass: string, name: string) => void, onCancel: () => void }) => {
  const [type, setType] = useState<'json' | 'privateKey'>('json');
  const [val, setVal] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!val || !pass || !name) return alert("全ての項目を入力してください");
    setLoading(true);
    await onImport(type, val, pass, name);
    setLoading(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const r = new FileReader();
      r.onload = (ev) => setVal(ev.target?.result as string);
      r.readAsText(file);
    }
  };

  return (
    <Wrapper title="インポート" backAction={onCancel}>
      <GlassCard>
        <div className="flex bg-slate-950/50 rounded-lg p-1 mb-4 border border-slate-700/50">
          {['json', 'privateKey'].map(t => (
            <button key={t} onClick={() => setType(t as any)} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${type === t ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-cyan-200'}`}>
              {t === 'json' ? 'JSONファイル' : '秘密鍵'}
            </button>
          ))}
        </div>
        
        <Input placeholder="アカウント名 (例: メイン)" value={name} onChange={(e:any) => setName(e.target.value)} />
        
        {type === 'json' ? (
          <div className="border border-dashed border-slate-600 rounded-xl p-4 mb-4 text-center hover:border-cyan-500/50 transition bg-slate-950/30">
            <input type="file" className="text-xs text-slate-400 file:mr-2" onChange={onFileChange} />
          </div>
        ) : (
          <Input placeholder="秘密鍵 (0x...)" value={val} onChange={(e:any) => setVal(e.target.value)} />
        )}
        
        <Input type="password" placeholder="パスワード" value={pass} onChange={(e:any) => setPass(e.target.value)} />
        
        <Button onClick={handleImport} disabled={loading}>{loading ? "インポート中..." : "インポート"}</Button>
      </GlassCard>
    </Wrapper>
  );
};