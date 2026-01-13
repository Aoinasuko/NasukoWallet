import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { encryptData, decryptData, verifyTotp } from './cryptoUtils';
import './App.css'; 

import { DEFAULT_NETWORKS } from './constants';
import type { SavedAccount, VaultData, StorageSession, StorageLocal, TxHistory, NetworkConfig, TokenData, NftData, AlchemyHistory } from './types';
import { fetchTokens, fetchNfts, fetchTransactionHistory } from './alchemy';
import { fetchCurrentPrice } from './services/priceService';

import { WelcomeView, Setup2FAView, LoginView } from './components/views/Auth';
import { HomeView } from './components/views/HomeView';
import { SendView } from './components/views/SendView';
import { HistoryView } from './components/views/HistoryView';
import { AccountListView, ImportView } from './components/views/Accounts';
import { SettingsMenuView, SettingsAccountView, SettingsGeneralView, SettingsNetworkListView, SettingsNetworkAddView } from './components/views/Settings';
import { ReceiveView } from './components/views/Actions';
import { SwapView } from './components/views/SwapView';
import { RunnerView } from './components/views/RunnerView';

function App() {
  // "Runner tab" mode: open index.html?mode=runner in a normal Chrome tab to avoid MV3 sleep.
  const isRunnerMode = (() => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('mode') === 'runner';
    } catch {
      return false;
    }
  })();
  const [view, setView] = useState('loading'); 
  const [networkKey, setNetworkKey] = useState<string>('sepolia');
  const [allNetworks, setAllNetworks] = useState<Record<string, NetworkConfig>>(DEFAULT_NETWORKS);
  
  const [mainNetwork, setMainNetwork] = useState<string>('mainnet');

  const [wallet, setWallet] = useState<ethers.Wallet | ethers.HDNodeWallet | null>(null);
  const [balance, setBalance] = useState('0');
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [currentPrice, setCurrentPrice] = useState<{usd: number, jpy: number, usdChange: number, jpyChange: number} | null>(null);
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

  // 履歴ロード
  useEffect(() => {
    const loadHistory = async () => {
      if (!wallet) return;
      
      const cacheKey = `${networkKey}_${wallet.address.toLowerCase()}`;
      const local = await chrome.storage.local.get(['historyCache']) as StorageLocal;
      const cache = local.historyCache?.[cacheKey];
      
      let cachedHistory: TxHistory[] = [];
      if (cache && cache.data.length > 0) {
        cachedHistory = cache.data;
        setTxHistory(cachedHistory);
        setHistoryLastUpdated(new Date(cache.lastUpdated).toLocaleString());
      } else {
        setTxHistory([]);
      }

      try {
        const fetchedHistory = await fetchTransactionHistory(wallet.address, networkKey);
        const existingMap = new Map(cachedHistory.map((t: TxHistory) => [t.hash, t]));

        const mergedHistory: TxHistory[] = fetchedHistory.map((h: AlchemyHistory) => {
          const existing = existingMap.get(h.hash);
          
          let priceInUsd = existing?.priceInUsd;
          let priceInJpy = existing?.priceInJpy;
          
          // レート再計算ロジック (バグ修正用)
          let calculatedRate = undefined;
          if (h.type === 'swap' && h.amount && h.receivedAmount) {
             const sent = parseFloat(h.amount);
             const recv = parseFloat(h.receivedAmount);
             if (sent > 0) {
                 calculatedRate = recv / sent;
             }
          } else if (existing?.exchangeRate) {
             calculatedRate = existing.exchangeRate;
          }

          return {
            id: h.id, 
            hash: h.hash, 
            type: h.type, 
            amount: h.amount, 
            symbol: h.symbol, 
            from: h.from, 
            to: h.to, 
            date: h.date, 
            network: allNetworks[networkKey]?.name || networkKey,
            receivedAmount: h.receivedAmount,
            exchangeRate: calculatedRate, 
            priceInUsd: priceInUsd, 
            priceInJpy: priceInJpy 
          };
        });

        setTxHistory(mergedHistory);
        const now = Date.now();
        setHistoryLastUpdated(new Date(now).toLocaleString());
        
        const newCache = { ...(local.historyCache || {}), [cacheKey]: { lastUpdated: now, data: mergedHistory } };
        await chrome.storage.local.set({ historyCache: newCache });
      } catch (e) { console.error("History sync failed", e); }
    };
    if (wallet) loadHistory();
  }, [wallet?.address, networkKey, view]);

  // --- Functions ---
  const checkLoginStatus = async () => {
    const session = await chrome.storage.session.get(['masterPass']) as StorageSession;
    const local = await chrome.storage.local.get([
      'vault',
      'accounts',
      'network',
      'bgImage',
      'customNetworks',
      'mainNetwork',
    ]) as StorageLocal & { mainNetwork?: string };
    
    if (local.accounts) setSavedAccounts(local.accounts);
    let merged = { ...DEFAULT_NETWORKS, ...(local.customNetworks || {}) };
    setAllNetworks(merged);
    const net = (local.network && merged[local.network]) ? local.network : 'sepolia';
    setNetworkKey(net);
    if (local.bgImage) setBgImage(local.bgImage);
    const mainNet = local.mainNetwork || 'mainnet';
    setMainNetwork(mainNet);

    // Runner mode is independent from the vault login (it uses a separate bot key).
    if (isRunnerMode) {
      setView('runner');
      return;
    }

    if (!local.vault) setView('setup');
    else if (session.masterPass) { 
      setSessionMasterPass(session.masterPass); 
      setView('list'); 
      fetchPrices(merged[net], merged[mainNet]); 
    } 
    else setView('login');
  };

  const changeNetwork = (key: string) => {
    setNetworkKey(key);
    const net = allNetworks[key];
    chrome.runtime.sendMessage({ type: "NETWORK_CHANGED", payload: { rpcUrl: net.rpc, chainId: net.chainId } });
    chrome.storage.local.set({ network: key });
    fetchPrices(net, allNetworks[mainNetwork]);
    if (wallet) updateBalance(wallet, net.rpc);
  };
  
  const handleSetMainNetwork = async (key: string) => {
    setMainNetwork(key);
    await chrome.storage.local.set({ mainNetwork: key });
    fetchPrices(allNetworks[networkKey], allNetworks[key]);
  };
  
  const fetchPrices = async (currentNet: NetworkConfig, mainNet?: NetworkConfig) => {
    const currentId = currentNet.coingeckoId;
    if (currentId) {
      const res = await fetchCurrentPrice(currentId);
      if (res) {
        setCurrentPrice(res);
      }
    } else {
      setCurrentPrice(null);
    }

    const mainId = mainNet?.coingeckoId;
    if (mainId) {
       const res = await fetchCurrentPrice(mainId);
       if (res) {
         setMainCurrencyPrice({ usd: res.usd, jpy: res.jpy });
       }
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

  // ★追加: 履歴リセットハンドラ
  const handleResetHistory = async () => {
    if (!confirm("取引履歴とキャッシュを全てリセットしますか？\n（ブロックチェーン上のデータは消えませんが、アプリ内の損益計算用データは削除されます）")) return;
    
    setTxHistory([]);
    setHistoryLastUpdated(null);
    
    try {
      await chrome.storage.local.remove(['historyCache', 'history', 'priceCache']);
      alert("履歴をリセットしました。画面を再読み込みしてください。");
      // 必要であればリロード
      // window.location.reload(); 
    } catch (e) {
      console.error("Reset failed", e);
      alert("リセットに失敗しました");
    }
  };

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
  if (view === 'runner') return <RunnerView allNetworks={allNetworks} />;
  
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
    // ★修正: settings_menu をここに移動
    if (view === 'settings_menu') return <SettingsMenuView setView={setView} />;
    if (view === 'settings_account') return <SettingsAccountView privateKey={wallet.privateKey} setView={setView} />;
    if (view === 'settings_general') return (
        <SettingsGeneralView 
            bgImage={bgImage} 
            onSetBg={handleSetBg} 
            mainNetwork={mainNetwork} 
            onSetMainNetwork={handleSetMainNetwork}
            allNetworks={allNetworks}
            setView={setView} 
            onResetHistory={handleResetHistory} // ★追加: 履歴リセット機能渡し
            
        />
    );
    if (view === 'settings_network_list') return <SettingsNetworkListView allNetworks={allNetworks} onDelete={handleDeleteNetwork} setView={setView} />;
    if (view === 'settings_network_add') return <SettingsNetworkAddView onAdd={handleAddNetwork} setView={setView} />;
  }

  if (view === 'list') return <AccountListView accounts={savedAccounts} onUnlock={handleUnlockAccount} onDelete={handleDeleteAccount} onAdd={() => setView('import')} />;
  if (view === 'import') return <ImportView onImport={handleImport} onCancel={() => setView('list')} />;
  // (settings_general は未ログインでもアクセス可能にしておく)
  if (view === 'settings_general') return (
    <SettingsGeneralView
      bgImage={bgImage}
      onSetBg={handleSetBg}
      mainNetwork={mainNetwork}
      onSetMainNetwork={handleSetMainNetwork}
      allNetworks={allNetworks}
      setView={setView}
      onResetHistory={handleResetHistory}
    />
  );

  return <div className="text-slate-500 p-10 text-center text-xs">Error: Unknown View ({view})</div>;
}

export default App;