import { useState, useEffect, useRef } from 'react';
import type { NetworkConfig } from '../types';
import { SmartIcon } from './UI'; // ★SmartIconをインポート

const NetworkSelector = ({ currentKey, allNetworks, onChange, onViewSettings }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<any>(null);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = allNetworks[currentKey] as NetworkConfig;
  if (!current) return null;

  return (
    <div className="flex items-center gap-2 relative" ref={wrapperRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-900/60 backdrop-blur border border-cyan-500/20 hover:bg-cyan-900/20 rounded-full pl-2 pr-3 py-1 transition"
      >
        {/* ★SmartIconを使用 */}
        <SmartIcon src={current.logo} symbol={current.symbol} className="w-5 h-5 rounded-full bg-white/10" />
        <span className="text-xs font-medium text-cyan-100">{current.name}</span>
        <span className="text-[10px] text-slate-400">▼</span>
      </button>

      <button onClick={onViewSettings} className="p-2 hover:bg-cyan-900/30 text-cyan-200 rounded-full transition">
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </button>

      {isOpen && (
        <div className="absolute top-10 right-0 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar">
          <div className="p-2 grid gap-1">
            {Object.entries(allNetworks).map(([key, val]: any) => (
              <button
                key={key}
                onClick={() => { onChange(key); setIsOpen(false); }}
                className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg text-xs transition ${currentKey === key ? 'bg-cyan-900/30 text-cyan-300' : 'hover:bg-white/5 text-slate-300'}`}
              >
                {/* ★SmartIconを使用 */}
                <SmartIcon src={val.logo} symbol={val.symbol} className="w-4 h-4 rounded-full" />
                <div className="flex-1 truncate">{val.name}</div>
                {val.isCustom && <span className="text-[9px] bg-slate-700 px-1 rounded text-slate-300">Custom</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const Wrapper = ({ children, title, bgImage, backAction, networkSelector, currentNetwork, allNetworks, onNetworkChange, onViewSettings }: any) => (
  <div className="relative w-[350px] h-[600px] overflow-hidden bg-slate-900 text-cyan-50 font-sans selection:bg-cyan-500/30">
    {bgImage ? (
      <div className="absolute inset-0 z-0"><img src={bgImage} className="w-full h-full object-cover opacity-80" /><div className="absolute inset-0 bg-slate-950/50 mix-blend-multiply"></div></div>
    ) : (
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black"><div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl"></div><div className="absolute top-40 -left-20 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl"></div></div>
    )}
    <div className="relative z-10 h-full flex flex-col p-4 overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-6 h-8">
        <div className="flex items-center gap-2">
          {backAction && (<button onClick={backAction} className="p-1.5 rounded-full hover:bg-cyan-900/40 text-cyan-200 transition"><svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></button>)}
          <h1 className="text-lg font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400">{title || "NasukoWallet"}</h1>
        </div>
        {networkSelector ? networkSelector : (currentNetwork ? (
           <NetworkSelector currentKey={currentNetwork} allNetworks={allNetworks} onChange={onNetworkChange} onViewSettings={onViewSettings} />
        ) : null)}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  </div>
);

export const PageWrapper = ({ children, title, bgImage }: any) => (
  <div className="relative min-h-screen w-full overflow-hidden bg-slate-900 text-cyan-50 font-sans selection:bg-cyan-500/30">
    {bgImage ? (
      <div className="absolute inset-0 z-0">
        <img src={bgImage} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-slate-950/55 mix-blend-multiply"></div>
      </div>
    ) : (
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-950 via-slate-950 to-black">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>
    )}
    <div className="relative z-10 min-h-screen w-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-400">
          {title || "Auto Trading"}
        </h1>
      </div>
      {children}
    </div>
  </div>
);
