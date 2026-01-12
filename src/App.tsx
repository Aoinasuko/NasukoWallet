import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { encryptData, decryptData, verifyTotp } from './cryptoUtils';
import './App.css'; 

import { DEFAULT_NETWORKS } from './constants';
import type { SavedAccount, VaultData, StorageSession, StorageLocal, TxHistory, NetworkConfig, TokenData, NftData, AlchemyHistory } from './types';
import { fetchTokens, fetchNfts, fetchTransactionHistory } from './alchemy';

import { WelcomeView, Setup2FAView, LoginView } from './components/views/Auth';
import { HomeView } from './components/views/HomeView';
import { SendView } from './components/views/SendView';
import { HistoryView } from './components/views/HistoryView';
import { AccountListView, ImportView } from './components/views/Accounts';
import { SettingsMenuView, SettingsAccountView, SettingsGeneralView, SettingsNetworkListView, SettingsNetworkAddView } from './components/views/Settings';
import { ReceiveView } from './components/views/Actions';
import { SwapView } from './components/views/SwapView';

function App() {
  const [view, setView] = useState('loading'); 
  const [networkKey, setNetworkKey] = useState<string>('sepolia');
  const [allNetworks, setAllNetworks] = useState<Record<string, NetworkConfig>>(DEFAULT_NETWORKS);
  
  // 設定されたメインネットワーク（基礎通貨）
  const [mainNetwork, setMainNetwork] = useState<string>('mainnet');

  const [wallet, setWallet] = useState<ethers.Wallet | ethers.HDNodeWallet | null>(null);
  const [balance, setBalance] = useState('0');
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  
  // currentPrice: 現在接続中のネットワーク通貨の価格
  const [currentPrice, setCurrentPrice] = useState<{usd: number, jpy: number, usdChange: number, jpyChange: number} | null>(null);
  
  // ★追加: mainCurrencyPrice: 設定された基礎通貨(mainNetwork)の価格
  const [mainCurrencyPrice, setMainCurrencyPrice] = useState<{usd: number, jpy: number} | null>(null);

  const [currency, setCurrency] = useState<'JPY' | 'USD'>('JPY');
  
  const [tokenList, setTokenList] = useState<TokenData[]>([]);
  const [nftList, setNftList] = useState<NftData[]>([]);
  const [isAssetLoading, setIsAssetLoading] = useState(false);
  const [txHistory, setTxHistory] = useState<TxHistory[]>([]);
  const [historyLastUpdated, setHistoryLastUpdated] = useState<string | null>(null);

  const [masterPass, setMasterPass] = useState(''); 
  const [sessionMasterPass, setSessionMasterPass] = useState(''); 
  const [tempSecret, setTempSecret] = useState<any>(null); 
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { checkLoginStatus(); }, []);

  const loadAssets = useCallback(async () => {
    if (!wallet) return;
    setIsAssetLoading(true);
    updateBalance(wallet, allNetworks[networkKey].rpc);
    
    const tokens = await fetchTokens(wallet.address, networkKey);
    setTokenList(tokens);
    const nfts = await fetchNfts(wallet.address, networkKey);
    setNftList(nfts);
    setIsAssetLoading(false);
  }, [wallet?.address, networkKey, allNetworks]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // 履歴ロード（レート計算修正済み）
  useEffect(() => {
    const loadHistory = async () => {
      if (!wallet) return;
      
      const cacheKey = `${networkKey}_${wallet.address.toLowerCase()}`;
      const local = await chrome.storage.local.get(['historyCache']) as StorageLocal;
      const cache = local.historyCache?.[cacheKey];
      
      if (cache && cache.data.length > 0) {
        setTxHistory(cache.data);
        setHistoryLastUpdated(new Date(cache.lastUpdated).toLocaleString());
      } else {
        setTxHistory([]);
      }

      try {
        const history = await fetchTransactionHistory(wallet.address, networkKey);
        const formattedHistory: TxHistory[] = history.map((h: AlchemyHistory) => {
          let calculatedRate = undefined;
          if (h.type === 'swap' && h.amount && h.receivedAmount) {
             const sent = parseFloat(h.amount);
             const recv = parseFloat(h.receivedAmount);
             if (sent > 0) calculatedRate = recv / sent;
          }
          return {
            id: h.id, hash: h.hash, type: h.type, amount: h.amount, symbol: h.symbol, 
            from: h.from, to: h.to, date: h.date, network: allNetworks[networkKey]?.name || networkKey,
            receivedAmount: h.receivedAmount, exchangeRate: calculatedRate
          };
        });
        setTxHistory(formattedHistory);
        const now = Date.now();
        setHistoryLastUpdated(new Date(now).toLocaleString());
        const newCache = { ...(local.historyCache || {}), [cacheKey]: { lastUpdated: now, data: formattedHistory } };
        await chrome.storage.local.set({ historyCache: newCache });
      } catch (e) { console.error("History sync failed", e); }
    };
    if (wallet) loadHistory();
  }, [wallet?.address, networkKey, view]);

  // --- Functions ---
  const checkLoginStatus = async () => {
    const session = await chrome.storage.session.get(['masterPass']) as StorageSession;
    const local = await chrome.storage.local.get(['vault', 'accounts', 'network', 'bgImage', 'customNetworks', 'mainNetwork']) as StorageLocal & { mainNetwork?: string };
    
    if (local.accounts) setSavedAccounts(local.accounts);
    let merged = { ...DEFAULT_NETWORKS, ...(local.customNetworks || {}) };
    setAllNetworks(merged);
    const net = (local.network && merged[local.network]) ? local.network : 'sepolia';
    setNetworkKey(net);
    if (local.bgImage) setBgImage(local.bgImage);
    
    // メインネットワーク設定の読み込み
    const mainNet = local.mainNetwork || 'mainnet';
    setMainNetwork(mainNet);

    if (!local.vault) setView('setup');
    else if (session.masterPass) { 
      setSessionMasterPass(session.masterPass); 
      setView('list'); 
      // 価格取得: 現在のネットワークとメインネットワーク両方
      fetchPrices(merged[net], merged[mainNet]); 
    } 
    else setView('login');
  };

  const changeNetwork = (key: string) => {
    setNetworkKey(key);
    const net = allNetworks[key];
    chrome.runtime.sendMessage({ type: "NETWORK_CHANGED", payload: { rpcUrl: net.rpc, chainId: net.chainId } });
    chrome.storage.local.set({ network: key });
    // 価格再取得
    fetchPrices(net, allNetworks[mainNetwork]);
    if (wallet) updateBalance(wallet, net.rpc);
  };
  
  const handleSetMainNetwork = async (key: string) => {
    setMainNetwork(key);
    await chrome.storage.local.set({ mainNetwork: key });
    // メイン通貨が変わったら価格再取得
    fetchPrices(allNetworks[networkKey], allNetworks[key]);
  };
  
  // ★修正: 接続中ネットワークとメインネットワークの両方の価格を取得
  const fetchPrices = async (currentNet: NetworkConfig, mainNet?: NetworkConfig) => {
    // 1. 現在のネットワークの価格
    const currentId = currentNet.coingeckoId;
    if (currentId) {
      const tryFetch = async (id: string) => { const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,jpy&include_24hr_change=true`); if (!res.ok) throw new Error("API Error"); return await res.json(); };
      try { 
        let data = await tryFetch(currentId); 
        if (currentId === "polygon-ecosystem-token" && (!data || !data[currentId])) { data = await tryFetch("matic-network"); } 
        const res = data[currentId] || data["matic-network"];
        if(res) { setCurrentPrice({ usd: res.usd, jpy: res.jpy, usdChange: res.usd_24h_change || 0, jpyChange: res.jpy_24h_change || 0 }); }
      } catch(e) { /* ignore */ }
    } else {
      setCurrentPrice(null);
    }

    // 2. メインネットワーク（基礎通貨）の価格
    const mainId = mainNet?.coingeckoId;
    if (mainId) {
       try {
         const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${mainId}&vs_currencies=usd,jpy`);
         const data = await res.json();
         const p = data[mainId] || data["matic-network"]; // Polygonフォールバック
         if (p) setMainCurrencyPrice({ usd: p.usd, jpy: p.jpy });
       } catch(e) { setMainCurrencyPrice(null); }
    } else {
       setMainCurrencyPrice(null);
    }
  };

  const updateBalance = async (w?: ethers.Wallet | ethers.HDNodeWallet, rpcUrl?: string) => {
    const targetWallet = w || wallet;
    const targetRpc = rpcUrl || allNetworks[networkKey].rpc;
    if(!targetWallet) return;
    try { 
      const provider = new ethers.JsonRpcProvider(targetRpc); 
      const connected = targetWallet.connect(provider); 
      const bal = await provider.getBalance(connected.address); 
      setBalance(ethers.formatEther(bal)); 
    } catch (e) { setBalance('0'); }
  };

  // Handlers (既存のまま)
  const handleStartSetup = (pass: string, secret: any, qr: string) => { setMasterPass(pass); setTempSecret(secret); setQrDataUrl(qr); setView('2fa_setup'); };
  const handleFinishSetup = async (code: string) => { if (!verifyTotp(code, tempSecret.base32 || tempSecret)) return alert("コードが違います"); const v: VaultData = { totpSecret: tempSecret.base32 || tempSecret, isSetupComplete: true }; await chrome.storage.local.set({ vault: encryptData(v, masterPass) }); await chrome.storage.session.set({ masterPass }); setSessionMasterPass(masterPass); setView('list'); };
  const handleLogin = async (pass: string, code: string) => { setLoading(true); try { const local = await chrome.storage.local.get(['vault']) as StorageLocal; const v = decryptData(local.vault!, pass) as VaultData; if (!v || !verifyTotp(code, v.totpSecret)) throw new Error(); await chrome.storage.session.set({ masterPass: pass }); setSessionMasterPass(pass); setView('list'); fetchPrices(allNetworks[networkKey], allNetworks[local.mainNetwork || 'mainnet']); } catch { alert("認証に失敗しました"); } finally { setLoading(false); } };
  const handleUnlockAccount = async (acc: SavedAccount) => { setLoading(true); try { const pass = decryptData(acc.encryptedPassword, sessionMasterPass); const w = await ethers.Wallet.fromEncryptedJson(acc.encryptedJson, pass); chrome.runtime.sendMessage({ type: "WALLET_UNLOCKED", address: w.address }); setWallet(w); updateBalance(w, allNetworks[networkKey].rpc); setView('home'); } catch { alert("解除に失敗しました"); } finally { setLoading(false); } };
  const handleImport = async (type: 'json'|'privateKey', val: string, pass: string, name: string) => { try { let w, j; if (type === 'json') { w = await ethers.Wallet.fromEncryptedJson(val, pass); j = val; } else { w = new ethers.Wallet(val.startsWith('0x') ? val : '0x' + val); j = await w.encrypt(pass); } if (savedAccounts.find(a => a.address === w.address)) return alert("既に登録されています"); const ep = encryptData(pass, sessionMasterPass); const n = [...savedAccounts, { name, address: w.address, encryptedJson: j, encryptedPassword: ep }]; setSavedAccounts(n); await chrome.storage.local.set({ accounts: n }); setView('list'); } catch { alert("インポート失敗"); } };
  const handleDeleteAccount = async (addr: string) => { if (!confirm("本当に削除しますか？")) return; const n = savedAccounts.filter(a => a.address !== addr); setSavedAccounts(n); await chrome.storage.local.set({ accounts: n }); };
  const handleSetBg = async (img: string | null) => { setBgImage(img); if(img) await chrome.storage.local.set({ bgImage: img }); else await chrome.storage.local.remove('bgImage'); };
  const handleAddNetwork = async (form: any) => { const key = "custom_" + Date.now(); const newNet: NetworkConfig = { name: form.name, rpc: form.rpc, chainId: form.id, symbol: form.symbol, coingeckoId: "", explorer: form.explorer, color: "#888", logo: form.logo, isCustom: true }; const merged = { ...allNetworks, [key]: newNet }; setAllNetworks(merged); const local = await chrome.storage.local.get(['customNetworks']) as StorageLocal; await chrome.storage.local.set({ customNetworks: { ...(local.customNetworks || {}), [key]: newNet } }); setView('settings_network_list'); };
  const handleDeleteNetwork = async (key: string) => { if (!confirm("削除しますか？")) return; const merged = { ...allNetworks }; delete merged[key]; setAllNetworks(merged); const local = await chrome.storage.local.get(['customNetworks']) as StorageLocal; const current = local.customNetworks || {}; delete current[key]; await chrome.storage.local.set({ customNetworks: current }); if (networkKey === key) changeNetwork('sepolia'); };

  const handleTxComplete = async (newTx: TxHistory) => {
    const updatedHistory = [newTx, ...txHistory].slice(0, 50);
    setTxHistory(updatedHistory);
    if(wallet) {
      const cacheKey = `${networkKey}_${wallet.address.toLowerCase()}`;
      const local = await chrome.storage.local.get(['historyCache']) as StorageLocal;
      const newCache = { ...(local.historyCache || {}), [cacheKey]: { lastUpdated: Date.now(), data: updatedHistory } };
      await chrome.storage.local.set({ historyCache: newCache });
    }
    setTimeout(() => { loadAssets(); }, 2000);
  };

  if (view === 'loading') return <div className="text-slate-500 p-10 text-center text-xs">Loading...</div>;
  if (view === 'setup') return <WelcomeView onStartSetup={handleStartSetup} />;
  if (view === '2fa_setup') return <Setup2FAView qrUrl={qrDataUrl} onFinishSetup={handleFinishSetup} />;
  if (view === 'login') return <LoginView onLogin={handleLogin} loading={loading} />;
  
  if (wallet) {
    if (view === 'home') return <HomeView wallet={wallet} balance={balance} networkKey={networkKey} allNetworks={allNetworks} currentPrice={currentPrice} currency={currency} onSetCurrency={() => setCurrency(prev => prev==='JPY'?'USD':'JPY')} tokenList={tokenList} nftList={nftList} isAssetLoading={isAssetLoading} onChangeNetwork={changeNetwork} setView={setView} onLogout={() => { setWallet(null); setView('list'); }} bgImage={bgImage} />;
    if (view === 'send') return <SendView wallet={wallet} balance={balance} networkKey={networkKey} allNetworks={allNetworks} savedAccounts={savedAccounts} setView={setView} onTxComplete={handleTxComplete} updateBalance={() => updateBalance(wallet, allNetworks[networkKey].rpc)} />;
    if (view === 'history') return <HistoryView wallet={wallet} networkKey={networkKey} allNetworks={allNetworks} setView={setView} txHistory={txHistory} setTxHistory={setTxHistory} lastUpdated={historyLastUpdated} />;
    if (view === 'receive') return <ReceiveView address={wallet.address} setView={setView} />;
    if (view === 'swap') return (
      <SwapView 
        networkKey={networkKey} 
        allNetworks={allNetworks} 
        mainNetwork={mainNetwork} 
        wallet={wallet} 
        txHistory={txHistory} 
        tokenList={tokenList}
        setView={setView} 
        onSwap={handleTxComplete}
        currentPrice={currentPrice}
        mainCurrencyPrice={mainCurrencyPrice}
      />
    );
    if (view === 'settings_account') return <SettingsAccountView privateKey={wallet.privateKey} setView={setView} />;
    if (view === 'settings_general') return (
        <SettingsGeneralView 
            bgImage={bgImage} 
            onSetBg={handleSetBg} 
            mainNetwork={mainNetwork} 
            onSetMainNetwork={handleSetMainNetwork}
            allNetworks={allNetworks}
            setView={setView} 
        />
    );
    if (view === 'settings_network_list') return <SettingsNetworkListView allNetworks={allNetworks} onDelete={handleDeleteNetwork} setView={setView} />;
    if (view === 'settings_network_add') return <SettingsNetworkAddView onAdd={handleAddNetwork} setView={setView} />;
  }

  // 以下省略（既存と同じ）
  if (view === 'list') return <AccountListView accounts={savedAccounts} onUnlock={handleUnlockAccount} onDelete={handleDeleteAccount} onAdd={() => setView('import')} />;
  if (view === 'import') return <ImportView onImport={handleImport} onCancel={() => setView('list')} />;
  if (view === 'settings_menu') return <SettingsMenuView setView={setView} />;
  if (view === 'settings_general') return <SettingsGeneralView bgImage={bgImage} onSetBg={handleSetBg} mainNetwork={mainNetwork} onSetMainNetwork={handleSetMainNetwork} allNetworks={allNetworks} setView={setView} />;

  return <div className="text-slate-500 p-10 text-center text-xs">Error: Unknown View ({view})</div>;
}

export default App;