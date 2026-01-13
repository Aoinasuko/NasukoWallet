import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, GlassCard, Input, Popup } from '../UI';
import type { NetworkConfig } from '../../types';
import { encryptData, decryptData } from '../../cryptoUtils';
import { startBotLoop, stopBotLoop, readTradeLog, type BotRuntimeStatus, type BotStrategy, type StoredBotKey, type BotTradeEvent, type BotLoopHandle } from '../../services/botEngine';
import { MAJOR_TOKENS_LIST, UNISWAP_ADDRESSES } from '../../constants';
import { fetchCurrentPrice } from '../../services/priceService';
import { PriceChart, type PricePoint, type TradeMarker } from '../PriceChart';

type MajorToken = {
  symbol: string;
  address: string;
  name: string;
  coingeckoId?: string;
};

type Props = {
  allNetworks: Record<string, NetworkConfig>;
};

const BOT_KEY_STORAGE_KEY = 'botKey';
const BOT_STRATEGY_STORAGE_KEY = 'botStrategy';

type PopupState = { open: boolean; title: string; message: string; details?: string };

const Field = ({ label, children }: { label: string; children: any }) => (
  <div>
    <div className="text-xs text-white/70 mb-1">{label}</div>
    {children}
  </div>
);


export const RunnerView = ({ allNetworks }: Props) => {
  const networks = useMemo(() => Object.entries(allNetworks || {}), [allNetworks]);

  const [networkKey, setNetworkKey] = useState(networks[0]?.[0] || 'mainnet');

  const majorTokens = useMemo<MajorToken[]>(() => (MAJOR_TOKENS_LIST[networkKey] || []) as any, [networkKey]);

  const [baseTokenAddress, setBaseTokenAddress] = useState<'NATIVE' | 'USDC' | string>('USDC');
  const [targetAddress, setTargetAddress] = useState<string>('');
  const [amountIn, setAmountIn] = useState<string>('50');
  const [takeProfitPct, setTakeProfitPct] = useState<number>(2);
  const [stopLossPct, setStopLossPct] = useState<number>(2);
  const [reentryDropPct, setReentryDropPct] = useState<number>(1);
  const [pollSeconds, setPollSeconds] = useState<number>(20);

  // Key handling
  const [passphrase, setPassphrase] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);

  // Update/rotate key
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPrivateKey, setNewPrivateKey] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');

  const [runtime, setRuntime] = useState<BotRuntimeStatus>({ running: false, phase: 'IDLE' });
  const [popup, setPopup] = useState<PopupState>({ open: false, title: '', message: '' });

  const [baseHistory, setBaseHistory] = useState<PricePoint[]>([]);
  const [targetHistory, setTargetHistory] = useState<PricePoint[]>([]);
  const [markers, setMarkers] = useState<TradeMarker[]>([]);
  const lastPriceBasePerTargetRef = useRef<number | undefined>(undefined);

  const botHandleRef = useRef<BotLoopHandle | null>(null);

  const selectedTarget: MajorToken | undefined = useMemo(() => majorTokens.find(t => t.address === targetAddress), [majorTokens, targetAddress]);

  const baseTokenSymbol = useMemo(() => {
    const nativeSym = allNetworks[networkKey]?.symbol || 'NATIVE';
    if (baseTokenAddress === 'NATIVE') return nativeSym;
    if (baseTokenAddress === 'USDC') return 'USDC';
    const wrapped = UNISWAP_ADDRESSES[networkKey]?.WETH;
    if (wrapped && baseTokenAddress.toLowerCase() === wrapped.toLowerCase()) return `Wrapped ${nativeSym}`;
    const t = majorTokens.find((x) => x.address.toLowerCase() === baseTokenAddress.toLowerCase());
    return t?.symbol || 'TOKEN';
  }, [baseTokenAddress, allNetworks, networkKey, majorTokens]);

  const strategy: BotStrategy = useMemo(() => {
    const sym = selectedTarget?.symbol || '';
    return {
      networkKey,
      baseTokenAddress,
      baseTokenSymbol,
      targetTokenAddress: targetAddress,
      targetTokenSymbol: sym,
      amountIn,
      takeProfitPct,
      stopLossPct,
      reentryDropPct,
      pollSeconds,
    };
  }, [networkKey, baseTokenAddress, baseTokenSymbol, targetAddress, selectedTarget, amountIn, takeProfitPct, stopLossPct, reentryDropPct, pollSeconds]);

  const loadSaved = async () => {
    const local = await chrome.storage.local.get([BOT_KEY_STORAGE_KEY, BOT_STRATEGY_STORAGE_KEY]);
    const savedKey = local[BOT_KEY_STORAGE_KEY] as StoredBotKey | undefined;
    const savedStrat = local[BOT_STRATEGY_STORAGE_KEY] as BotStrategy | undefined;
    setHasSavedKey(!!savedKey?.ciphertext);

    if (savedStrat) {
      setNetworkKey(savedStrat.networkKey || networkKey);
      setBaseTokenAddress((savedStrat.baseTokenAddress as any) || 'USDC');
      setTargetAddress(savedStrat.targetTokenAddress || '');
      setAmountIn(savedStrat.amountIn || '50');
      setTakeProfitPct(Number(savedStrat.takeProfitPct) || 2);
      setStopLossPct(Number(savedStrat.stopLossPct) || 2);
      setReentryDropPct(Number(savedStrat.reentryDropPct) || 1);
      setPollSeconds(Number(savedStrat.pollSeconds) || 20);
    }
  };

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist strategy whenever it changes
  useEffect(() => {
    chrome.storage.local.set({ [BOT_STRATEGY_STORAGE_KEY]: strategy });
  }, [strategy]);

  const showErr = (title: string, message: string, details?: string) =>
    setPopup({ open: true, title, message, details });

  const handleSaveKey = async () => {
    try {
      if (!passphrase || passphrase.length < 4) throw new Error('パスフレーズを入力してください（4文字以上推奨）');
      if (!privateKey || !privateKey.startsWith('0x') || privateKey.length < 66) throw new Error('秘密鍵が不正です（0xから始まる64桁hex）');

      const ciphertext = encryptData({ privateKey }, passphrase);
      const stored: StoredBotKey = { ciphertext };
      await chrome.storage.local.set({ [BOT_KEY_STORAGE_KEY]: stored });
      setHasSavedKey(true);
      setPrivateKey('');
      showErr('保存完了', '秘密鍵を暗号化して保存しました。');
    } catch (e: any) {
      showErr('保存失敗', e?.message || 'Failed to save key', String(e));
    }
  };

  const handleUpdateKey = async () => {
    try {
      const local = await chrome.storage.local.get([BOT_KEY_STORAGE_KEY]);
      const stored = local[BOT_KEY_STORAGE_KEY] as StoredBotKey | undefined;
      if (!stored?.ciphertext) throw new Error('保存済みの秘密鍵がありません');

      if (!currentPassphrase) throw new Error('現在のパスフレーズを入力してください');
      // verify and get existing key
      const decrypted = decryptData(stored.ciphertext, currentPassphrase) as any;
      const existingPk = decrypted?.privateKey;
      if (!existingPk) throw new Error('復号に失敗しました（パスフレーズが違う可能性があります）');

      const nextPk = newPrivateKey ? newPrivateKey : existingPk;
      if (!nextPk.startsWith('0x') || nextPk.length < 66) throw new Error('新しい秘密鍵が不正です');

      const nextPass = newPassphrase ? newPassphrase : currentPassphrase;
      if (nextPass.length < 4) throw new Error('新しいパスフレーズが短すぎます');

      const ciphertext = encryptData({ privateKey: nextPk }, nextPass);
      await chrome.storage.local.set({ [BOT_KEY_STORAGE_KEY]: { ciphertext } as StoredBotKey });

      setHasSavedKey(true);
      setCurrentPassphrase('');
      setNewPrivateKey('');
      setNewPassphrase('');
      showErr('更新完了', '秘密鍵/パスフレーズを更新しました。');
    } catch (e: any) {
      showErr('更新失敗', e?.message || 'Failed to update key', String(e));
    }
  };

  const handleDeleteKey = async () => {
    await chrome.storage.local.remove([BOT_KEY_STORAGE_KEY]);
    setHasSavedKey(false);
    showErr('削除', '保存済み秘密鍵を削除しました。');
  };

  const resolveRpcUrl = (): string => {
    const rpc = allNetworks[networkKey]?.rpc;
    if (!rpc) throw new Error('RPCが設定されていません');
    return rpc;
  };

  const resolveBaseCoingeckoId = (): string | null => {
    if (baseTokenAddress === 'USDC') return 'usd-coin';
    return allNetworks[networkKey]?.coingeckoId || null;
  };

  const resolveTargetCoingeckoId = (): string | null => {
    return selectedTarget?.coingeckoId || null;
  };

  const fetchChartTick = async () => {
    try {
      const now = Date.now();
      const baseId = resolveBaseCoingeckoId();
      const targetId = resolveTargetCoingeckoId();

      let baseUsd: number | null = null;
      if (baseId === 'usd-coin') baseUsd = 1;
      else if (baseId) baseUsd = (await fetchCurrentPrice(baseId))?.usd ?? null;

      let targetUsd: number | null = null;
      if (targetId) {
        targetUsd = (await fetchCurrentPrice(targetId))?.usd ?? null;
      } else if (baseUsd != null && lastPriceBasePerTargetRef.current != null) {
        // priceBasePerTarget * baseUsd = targetUsd
        targetUsd = lastPriceBasePerTargetRef.current * baseUsd;
      }

      if (baseUsd != null) {
        setBaseHistory(prev => [...prev, { t: now, value: baseUsd }].slice(-240));
      }
      if (targetUsd != null) {
        setTargetHistory(prev => [...prev, { t: now, value: targetUsd }].slice(-240));
      }
    } catch (e) {
      // chart failure should not block bot
      console.warn('chart tick failed', e);
    }
  };

  // chart interval: 1 minute
  useEffect(() => {
    fetchChartTick();
    const id = window.setInterval(() => { fetchChartTick(); }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkKey, baseTokenAddress, targetAddress]);

  // Load trade markers (and keep updated)
  const refreshMarkers = async () => {
    const log = await readTradeLog();
    const m: TradeMarker[] = log.slice(-50).map(e => ({ t: e.t, label: e.kind === 'ENTRY' ? 'BUY' : 'SELL' }));
    setMarkers(m);
  };

  useEffect(() => {
    refreshMarkers();
  }, []);

  const handleStart = async () => {
    try {
      if (runtime.running) return;
      if (!targetAddress) throw new Error('Targetトークンを選択してください');
      if (!amountIn || Number(amountIn) <= 0) throw new Error('投入額が不正です');

      const rpcUrl = resolveRpcUrl();

      const local = await chrome.storage.local.get([BOT_KEY_STORAGE_KEY]);
      const stored = local[BOT_KEY_STORAGE_KEY] as StoredBotKey | undefined;
      if (!stored?.ciphertext) throw new Error('秘密鍵が保存されていません（まず保存してください）');
      if (!passphrase) throw new Error('起動用パスフレーズを入力してください');

      const decrypted = decryptData(stored.ciphertext, passphrase) as any;
      const pk = decrypted?.privateKey;
      if (!pk) throw new Error('復号に失敗しました（パスフレーズが違う可能性があります）');

      // Pre-check: USDC configured if chosen
      if (baseTokenAddress === 'USDC') {
        const usdc = UNISWAP_ADDRESSES[networkKey]?.USDC;
        if (!usdc) throw new Error('このネットワークにはUSDC設定がありません');
      }

      botHandleRef.current = startBotLoop({
        privateKey: pk,
        rpcUrl,
        strategy,
        onStatus: (s) => {
          setRuntime(s);
          if (s.lastPrice != null) lastPriceBasePerTargetRef.current = s.lastPrice;
        },
        onTrade: async (_e: BotTradeEvent) => {
          await refreshMarkers();
          await fetchChartTick();
        },
        onError: (e) => {
          showErr('Bot error', e.message, e.details);
        },
      });

      showErr('起動', '自動取引を開始しました。Runnerタブを閉じると停止します。');
    } catch (e: any) {
      showErr('開始失敗', e?.message || 'Failed to start', String(e));
    }
  };

  const handleStop = async () => {
    try {
      if (botHandleRef.current) {
        stopBotLoop(botHandleRef.current);
        botHandleRef.current = null;
      }
      setRuntime({ running: false, phase: 'IDLE' });
      showErr('停止', '自動取引を停止しました。');
    } catch (e: any) {
      showErr('停止失敗', e?.message || 'Failed to stop', String(e));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="text-xl font-semibold text-white/90">🤖 Auto Trader Runner</div>

      <GlassCard>
        <div className="text-sm font-semibold text-white/90 mb-3">戦略設定</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/70 mb-1">Network</div>
            <select
              className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white/90"
              value={networkKey}
              onChange={(e) => setNetworkKey(e.target.value)}
            >
              {networks.map(([k, n]) => (
                <option key={k} value={k}>{n.name} ({n.symbol})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-white/70 mb-1">Base</div>
            <select
              className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white/90"
              value={baseTokenAddress}
              onChange={(e) => setBaseTokenAddress(e.target.value as any)}
            >
              <option value="USDC">USDC</option>
              <option value="NATIVE">Native ({allNetworks[networkKey]?.symbol || 'NATIVE'})</option>

              {UNISWAP_ADDRESSES[networkKey]?.WETH ? (
                <option value={UNISWAP_ADDRESSES[networkKey]!.WETH}>
                  Wrapped {allNetworks[networkKey]?.symbol || 'NATIVE'}
                </option>
              ) : null}
              <optgroup label="Major tokens">
                {majorTokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} - {t.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-white/70 mb-1">Target token</div>
            <select
              className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-sm text-white/90"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
            >
              <option value="">Select token…</option>
              {majorTokens.map((t) => (
                <option key={t.address} value={t.address}>{(UNISWAP_ADDRESSES[networkKey]?.WETH && t.address.toLowerCase() === UNISWAP_ADDRESSES[networkKey]!.WETH.toLowerCase()) ? `Wrapped ${allNetworks[networkKey]?.symbol || 'NATIVE'}` : t.symbol} - {t.name}</option>
              ))}
            </select>
          </div>

          <Field label={`投入額（${baseTokenSymbol}）`}><Input value={amountIn} onChange={(e:any)=>setAmountIn(e.target.value)} /></Field>
          <Field label="Polling seconds"><Input value={String(pollSeconds)} onChange={(e:any)=>setPollSeconds(Number(e.target.value)||20)} /></Field>

          <Field label="Take Profit %"><Input value={String(takeProfitPct)} onChange={(e:any)=>setTakeProfitPct(Number(e.target.value)||0)} /></Field>
          <Field label="Stop Loss %"><Input value={String(stopLossPct)} onChange={(e:any)=>setStopLossPct(Number(e.target.value)||0)} /></Field>
          <Field label="Re-entry drop %"><Input value={String(reentryDropPct)} onChange={(e:any)=>setReentryDropPct(Number(e.target.value)||0)} /></Field>
        </div>

        <div className="mt-4 text-xs text-white/70">
          Status: <span className="text-white/90">{runtime.running ? 'RUNNING' : 'STOPPED'}</span> / Phase: <span className="text-white/90">{runtime.phase}</span>
          {runtime.lastPrice != null && (
            <span className="ml-2">Price(base/target): <span className="text-white/90">{runtime.lastPrice.toLocaleString(undefined,{maximumFractionDigits: 10})}</span></span>
          )}
          {runtime.message && <span className="ml-2 text-white/70">({runtime.message})</span>}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={handleStart} disabled={runtime.running}>Start</Button>
          <Button variant="secondary" onClick={handleStop} disabled={!runtime.running}>Stop</Button>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="text-sm font-semibold text-white/90 mb-3">🔐 秘密鍵</div>

        <div className="text-xs text-white/70 mb-2">
          保存済み: <span className="text-white/90">{hasSavedKey ? 'あり' : 'なし'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Bot key passphrase（起動時に使用）"><Input value={passphrase} onChange={(e:any)=>setPassphrase(e.target.value)} /></Field>
          <Field label="Bot private key（初回保存用）"><Input value={privateKey} onChange={(e:any)=>setPrivateKey(e.target.value)} /></Field>

          <div className="md:col-span-2 flex gap-2">
            <Button onClick={handleSaveKey}>秘密鍵を暗号化して保存</Button>
            <Button variant="secondary" onClick={handleDeleteKey} disabled={!hasSavedKey}>保存済み鍵を削除</Button>
          </div>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-xs font-semibold text-white/80 mb-2">秘密鍵の修正（更新/パスフレーズ変更）</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="現在のパスフレーズ"><Input value={currentPassphrase} onChange={(e:any)=>setCurrentPassphrase(e.target.value)} /></Field>
            <Field label="新しい秘密鍵（空なら保持）"><Input value={newPrivateKey} onChange={(e:any)=>setNewPrivateKey(e.target.value)} /></Field>
            <Field label="新しいパスフレーズ（空なら保持）"><Input value={newPassphrase} onChange={(e:any)=>setNewPassphrase(e.target.value)} /></Field>
            <div className="md:col-span-2">
              <Button onClick={handleUpdateKey} disabled={!hasSavedKey}>更新する</Button>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/60">
            ※現在のパスフレーズで復号できた場合のみ更新します。自分用でも少額運用推奨。
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="text-sm font-semibold text-white/90 mb-3">📈 チャート（1分ごと更新）</div>
        <div className="space-y-4">
          <PriceChart title={`${baseTokenSymbol} price (USD)`} points={baseHistory} markers={markers} valueSuffix=" USD" />
          <PriceChart title={`${selectedTarget?.symbol || 'Target'} price (USD)`} points={targetHistory} markers={markers} valueSuffix=" USD" />
          <div className="text-[11px] text-white/60">
            BUY/SELL の縦線は、自動取引で送信したトランザクション時刻（端末時刻）です。
          </div>
        </div>
      </GlassCard>

      <Popup
        open={popup.open}
        title={popup.title}
        message={popup.message}
        details={popup.details}
        onClose={() => setPopup({ open: false, title: '', message: '' })}
      />
    </div>
  );
};
