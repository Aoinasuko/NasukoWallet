import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button, GlassCard, Input, Popup } from '../UI';
import type { NetworkConfig, SavedAccount } from '../../types';
import { decryptData } from '../../cryptoUtils';
import { startBotLoop, stopBotLoop, readTradeLog, clearTradeLog, type BotRuntimeStatus, type BotStrategy, type BotTradeEvent, type BotLoopHandle } from '../../services/botEngine';
import { MAJOR_TOKENS_LIST, UNISWAP_ADDRESSES } from '../../constants';
import { getTokenPriceUsdCached } from '../../services/tokenPriceCache';
import { PriceChart, type PricePoint, type TradeMarker } from '../PriceChart';
import { PageWrapper } from '../Layout';
import { ethers } from 'ethers';
import type { TokenData } from '../../types';
import { fetchHeldTokensBasic, fetchTokenMetadataBasic } from '../../alchemy';
import { fetchDexScreenerTokenStats } from '../../services/dexScreenerService';

type MajorToken = {
  symbol: string;
  address: string;
  name: string;
  coingeckoId?: string;
};

type RecommendedToken = {
  token: MajorToken;
  volumeH24Usd: number;
};

type Props = {
  wallet: ethers.Wallet | ethers.HDNodeWallet | null;
  networkKey: string;
  allNetworks: Record<string, NetworkConfig>;
  bgImage: string | null;
};

const RUNNER_BG_KEY = 'autoTradeBgImage';

export const RunnerView = ({ wallet, networkKey: appNetworkKey, allNetworks, bgImage }: Props) => {
  const [networkKey, setNetworkKey] = useState<string>(appNetworkKey);
  const [resolvedWallet, setResolvedWallet] = useState<ethers.Wallet | ethers.HDNodeWallet | null>(wallet);
  const [baseTokenAddress, setBaseTokenAddress] = useState<string>('USDC'); // 'USDC' | 'NATIVE' | ERC20 address
  const [targetAddress, setTargetAddress] = useState<string>('');
  const [amountIn, setAmountIn] = useState<string>('50');
  const [takeProfitPct, setTakeProfitPct] = useState<number>(2);
  const [stopLossPct, setStopLossPct] = useState<number>(2);
  const [reentryDropPct, setReentryDropPct] = useState<number>(1);
  const [pollSeconds, setPollSeconds] = useState<number>(10);

  const [runtime, setRuntime] = useState<BotRuntimeStatus>({ running: false, phase: 'IDLE' });
  const botHandleRef = useRef<BotLoopHandle | null>(null);

  const [popup, setPopup] = useState<{ title: string; message: string; details?: string } | null>(null);

  const [runnerBg, setRunnerBg] = useState<string | null>(null);

  // token sources
  const [heldTokens, setHeldTokens] = useState<TokenData[]>([]);
  const [customTargetAddr, setCustomTargetAddr] = useState<string>('');
  const [customTargets, setCustomTargets] = useState<MajorToken[]>([]);
  const [recommended, setRecommended] = useState<RecommendedToken[]>([]);
  useEffect(() => {
    setResolvedWallet(wallet);
  }, [wallet]);

  // Restore wallet in Runner tab using the same vault/session as the main popup.
  useEffect(() => {
    const restore = async () => {
      try {
        if (resolvedWallet) return;

        const sess = await chrome.storage.session.get(['masterPass']);
        const masterPass = (sess.masterPass as string | undefined) || '';
        if (!masterPass) { throw new Error('ログインしていません。ホーム画面でログインしてから自動取引タブを開いてください。'); }
        if (!masterPass) return;

        const local = await chrome.storage.local.get(['accounts', 'lastUnlockedAccount']);
        const accounts = (local.accounts as SavedAccount[] | undefined) || [];
        if (!accounts.length) return;

        const preferred = (local.lastUnlockedAccount as string | undefined) || '';
        const acc = (preferred ? accounts.find(a => a.address.toLowerCase() === preferred.toLowerCase()) : null) || accounts[0];

        const jsonKeystore = acc.encryptedJson;
        const pwdDecrypted = decryptData(acc.encryptedPassword, masterPass);

        if (typeof jsonKeystore !== 'string' || jsonKeystore.trim().length < 10) {
          throw new Error('ログイン情報が不正です（Keystore JSONが空）。ホーム画面でアカウントを再インポートしてください。');
        }
        if (typeof pwdDecrypted !== 'string' || pwdDecrypted.trim().length === 0) {
          throw new Error('ログイン情報の復号に失敗しました（パスワードが不正）。ホーム画面でログインし直してください。');
        }

        // ethers keystore JSON must be a JSON object string
        const json = jsonKeystore.trim();
        const pwd = pwdDecrypted;

        const w = await ethers.Wallet.fromEncryptedJson(json, pwd);
        setResolvedWallet(w);
      } catch (e: any) {
        setPopup({
          title: '自動取引',
          message: 'ログイン情報の復元に失敗しました。',
          details: String(e?.stack || e?.message || e),
        });
      }
    };
    restore();
  }, [resolvedWallet]);

  // charts
  const [tfHours, setTfHours] = useState<1 | 12 | 24>(1);
  const [basePoints, setBasePoints] = useState<PricePoint[]>([]);
  const [targetPoints, setTargetPoints] = useState<PricePoint[]>([]);
  const [tradeLog, setTradeLog] = useState<BotTradeEvent[]>([]);

  // keep local networkKey in sync with app
  useEffect(() => { setNetworkKey(appNetworkKey); }, [appNetworkKey]);

  // load runner background
  useEffect(() => {
    (async () => {
      const local = await chrome.storage.local.get([RUNNER_BG_KEY]);
      const saved = local[RUNNER_BG_KEY] as string | undefined;
      if (saved) setRunnerBg(saved);
    })();
  }, []);

  const majorTokens: MajorToken[] = useMemo(() => {
    const list = MAJOR_TOKENS_LIST[networkKey] || [];
    // ensure unique by address
    const m = new Map<string, MajorToken>();
    for (const t of list) m.set(t.address.toLowerCase(), t);
    return [...m.values()];
  }, [networkKey]);

  // Fetch held ERC20 tokens for the logged-in account (Runner uses vault/session).
  useEffect(() => {
    const run = async () => {
      try {
        if (!resolvedWallet?.address) {
          setHeldTokens([]);
          return;
        }
        const tokens = await fetchHeldTokensBasic(resolvedWallet.address, networkKey);
        // Normalize + unique by address
        const m = new Map<string, TokenData>();
        for (const t of tokens) {
          m.set(t.address.toLowerCase(), t);
        }
        setHeldTokens([...m.values()]);
      } catch (e) {
        console.warn('fetchHeldTokensBasic failed', e);
        setHeldTokens([]);
      }
    };
    run();
  }, [resolvedWallet?.address, networkKey]);

  // Build recommended tokens from major list based on DexScreener 24h volume.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const list = majorTokens;
        if (!list.length) {
          if (!cancelled) setRecommended([]);
          return;
        }
        const stats = await Promise.all(
          list.map(async (t) => {
            const s = await fetchDexScreenerTokenStats({ networkKey, tokenAddress: t.address });
            return { t, vol: Number(s?.volumeH24Usd ?? 0) };
          })
        );
        const ranked = stats
          .filter(x => x.vol > 0)
          .sort((a, b) => b.vol - a.vol)
          .slice(0, 5)
          .map(x => ({ token: x.t, volumeH24Usd: x.vol }));
        if (!cancelled) setRecommended(ranked);
      } catch (e) {
        if (!cancelled) setRecommended([]);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [networkKey, majorTokens]);

  const allTargetOptions: MajorToken[] = useMemo(() => {
    const m = new Map<string, MajorToken>();
    for (const t of majorTokens) m.set(t.address.toLowerCase(), t);
    for (const t of heldTokens) {
      // held tokens may not have coingeckoId
      m.set(t.address.toLowerCase(), { symbol: t.symbol, address: t.address, name: t.name });
    }
    for (const t of customTargets) m.set(t.address.toLowerCase(), t);
    return [...m.values()];
  }, [majorTokens, heldTokens, customTargets]);

  const selectedTarget: MajorToken | undefined = useMemo(() => {
    if (!targetAddress) return undefined;
    return allTargetOptions.find(t => t.address.toLowerCase() === targetAddress.toLowerCase());
  }, [allTargetOptions, targetAddress]);

  const resolveBaseTokenAddressForSwap = (): string => {
    if (baseTokenAddress === 'USDC') return UNISWAP_ADDRESSES[networkKey]?.USDC ?? '';
    if (baseTokenAddress === 'NATIVE') return 'NATIVE'; // swapService handles NATIVE sentinel
    return baseTokenAddress; // ERC20 address
  };

  const resolveTargetTokenAddressForSwap = (): string => {
    if (!targetAddress) return '';
    return targetAddress;
  };

  const baseLabel = useMemo(() => {
    if (baseTokenAddress === 'USDC') return 'USDC';
    if (baseTokenAddress === 'NATIVE') return allNetworks[networkKey]?.symbol || 'NATIVE';
    const tMaj = majorTokens.find(x => x.address.toLowerCase() === baseTokenAddress.toLowerCase());
    if (tMaj) return tMaj.symbol;
    const tHeld = heldTokens.find(x => x.address.toLowerCase() === baseTokenAddress.toLowerCase());
    return tHeld ? tHeld.symbol : 'TOKEN';
  }, [baseTokenAddress, allNetworks, networkKey, majorTokens, heldTokens]);

  const formatUsd = (v: number): string => {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${Math.round(v)}`;
  };

  const addCustomTarget = async () => {
    try {
      const addr = customTargetAddr.trim();
      if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
        setPopup({ title: 'カスタムトークン', message: '有効なトークンアドレスを入力してください（0xから始まる42文字）。' });
        return;
      }
      const md = await fetchTokenMetadataBasic(addr, networkKey);
      const tok: MajorToken = {
        address: addr,
        symbol: md?.symbol || 'TOKEN',
        name: md?.name || 'Custom Token',
      };
      setCustomTargets(prev => {
        const m = new Map<string, MajorToken>();
        for (const t of prev) m.set(t.address.toLowerCase(), t);
        m.set(addr.toLowerCase(), tok);
        return [...m.values()];
      });
      setTargetAddress(addr);
      setCustomTargetAddr('');
    } catch (e: any) {
      setPopup({ title: 'カスタムトークン', message: `トークン情報の取得に失敗しました。\n${String(e?.message || e)}` });
    }
  };

  const strategy: BotStrategy = useMemo(() => ({
    networkKey,
    baseTokenAddress: resolveBaseTokenAddressForSwap(),
    baseTokenSymbol: baseLabel,
    targetTokenAddress: resolveTargetTokenAddressForSwap(),
    targetTokenSymbol: selectedTarget?.symbol || '',
    amountIn,
    takeProfitPct,
    stopLossPct,
    reentryDropPct,
    pollSeconds: Math.max(10, Math.floor(pollSeconds || 10)),
  }), [networkKey, baseTokenAddress, baseLabel, targetAddress, selectedTarget, amountIn, takeProfitPct, stopLossPct, reentryDropPct, pollSeconds]);

  // read trade log periodically (and use it for markers + PnL)
  useEffect(() => {
    let timer: any;
    const run = async () => {
      const log = await readTradeLog();
      setTradeLog(log);
    };
    run();
    timer = setInterval(run, 10_000);
    return () => clearInterval(timer);
  }, []);

  const markers: TradeMarker[] = useMemo(() => {
    return tradeLog.map(e => ({ t: e.t, label: e.kind === 'ENTRY' ? 'BUY' : 'SELL' }));
  }, [tradeLog]);

  // PnL estimation from tradeLog pairs (ENTRY->EXIT)
  const pnlUsd = useMemo(() => {
    // base is assumed USD-ish (USDC=1). For native base, we use base USD from chart latest.
    const latestBaseUsd = basePoints.length ? basePoints[basePoints.length - 1].value : 0;
    const baseIsUsd = baseTokenAddress === 'USDC';
    const amountBase = Number(strategy.amountIn || 0);
    let total = 0;
    let wins = 0;
    let losses = 0;
    let openEntryPrice: number | null = null;

    for (const e of tradeLog) {
      if (e.kind === 'ENTRY' && typeof e.priceBasePerTarget === 'number') {
        openEntryPrice = e.priceBasePerTarget;
      } else if (e.kind === 'EXIT' && openEntryPrice !== null && typeof e.priceBasePerTarget === 'number') {
        const entryPrice = openEntryPrice;
        const exitPrice = e.priceBasePerTarget;
        // target amount in units = amountBase / entryPrice
        const targetAmt = entryPrice > 0 ? (amountBase / entryPrice) : 0;
        const baseBack = targetAmt * exitPrice;
        const pnlBase = baseBack - amountBase;
        const pnl = baseIsUsd ? pnlBase : pnlBase * (latestBaseUsd || 0);
        total += pnl;
        if (pnl >= 0) wins += 1; else losses += 1;
        openEntryPrice = null;
      }
    }
    return { total, wins, losses };
  }, [tradeLog, strategy.amountIn, baseTokenAddress, basePoints]);

  // chart polling (10 sec) - uses cached price source (DexScreener + cache)
  useEffect(() => {
    let timer: any;

    const poll = async () => {
      try {
        const now = Date.now();
        const baseAddrForPrice = (() => {
          if (baseTokenAddress === 'USDC') return UNISWAP_ADDRESSES[networkKey]?.USDC ?? null;
          if (baseTokenAddress === 'NATIVE') return UNISWAP_ADDRESSES[networkKey]?.WETH ?? null; // wrapped native
          return baseTokenAddress || null;
        })();
        const targetAddrForPrice = targetAddress || null;

        // IMPORTANT: don't default non-stables to 1 USD (it breaks WMATIC/WPOL charts).
        // Only append a point when we actually have a price.
        let baseUsd: number | null = null;
        if (baseTokenAddress === 'USDC') {
          baseUsd = 1;
        } else if (baseAddrForPrice) {
          const v = await getTokenPriceUsdCached({ networkKey, tokenAddress: baseAddrForPrice });
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) baseUsd = v;
        }

        let targetUsd: number | null = null;
        if (targetAddrForPrice) {
          const v = await getTokenPriceUsdCached({ networkKey, tokenAddress: targetAddrForPrice });
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) targetUsd = v;
        }

        const maxPoints = 9000; // ~25h at 10s
        if (baseUsd !== null) {
          setBasePoints(prev => {
            const next = [...prev, { t: now, value: baseUsd as number }];
            return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
          });
        }
        if (targetUsd !== null) {
          setTargetPoints(prev => {
            const next = [...prev, { t: now, value: targetUsd }];
            return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
          });
        }
      } catch {
        // ignore
      }
    };

    poll();
    timer = setInterval(poll, 10_000);
    return () => clearInterval(timer);
  }, [networkKey, baseTokenAddress, targetAddress]);

  const filteredBasePoints = useMemo(() => {
    const cutoff = Date.now() - tfHours * 3600_000;
    return basePoints.filter(p => p.t >= cutoff);
  }, [basePoints, tfHours]);

  const filteredTargetPoints = useMemo(() => {
    const cutoff = Date.now() - tfHours * 3600_000;
    return targetPoints.filter(p => p.t >= cutoff);
  }, [targetPoints, tfHours]);

  const handleSetRunnerBg = async (file?: File) => {
    try {
      if (!file) {
        setRunnerBg(null);
        await chrome.storage.local.remove(RUNNER_BG_KEY);
        return;
      }
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
        reader.readAsDataURL(file);
      });
      setRunnerBg(dataUrl);
      await chrome.storage.local.set({ [RUNNER_BG_KEY]: dataUrl });
    } catch (e: any) {
      setPopup({ title: '背景画像', message: e?.message || '背景画像の設定に失敗しました' });
    }
  };

  
  const ensurePrivateKey = async (): Promise<string> => {
    // 1) If we already have a Wallet instance with privateKey, use it.
    const existingPk = (resolvedWallet as any)?.privateKey as string | undefined;
    if (existingPk) return existingPk;

    // 2) Try to restore from vault/session (same behavior as App unlock).
    const sess = await chrome.storage.session.get(['masterPass']);
    const masterPass = (sess.masterPass as string | undefined) || '';
    if (!masterPass) throw new Error('ログインが必要です（ホーム画面でログイン/解除してから実行してください）');

    const local = await chrome.storage.local.get(['accounts', 'lastUnlockedAccount']);
    const accounts = (local.accounts as SavedAccount[] | undefined) || [];
    if (!accounts.length) throw new Error('アカウントが見つかりません（先にホームでアカウントを追加してください）');

    const preferred = (local.lastUnlockedAccount as string | undefined) || '';
    const acc =
      (preferred ? accounts.find(a => a.address.toLowerCase() === preferred.toLowerCase()) : undefined) ||
      accounts[0];

    if (!masterPass) {
      throw new Error('ログインしていません。ホーム画面でログインしてから自動取引タブを開いてください。');
    }
    if (!acc) {
      throw new Error('アカウントが見つかりません。ホーム画面でアカウントを作成/インポートしてください。');
    }
    try {
      const jsonKeystore = acc.encryptedJson;
      const pwdDecrypted = decryptData((acc as any).encryptedPassword, masterPass);

      if (typeof jsonKeystore !== 'string' || jsonKeystore.trim().length < 10) {
        throw new Error('ログイン情報が不正です（Keystore JSONが空）。ホーム画面でアカウントを再インポートしてください。');
      }
      if (typeof pwdDecrypted !== 'string' || pwdDecrypted.trim().length === 0) {
        throw new Error('ログイン情報の復号に失敗しました（パスワードが不正）。ホーム画面でログインし直してください。');
      }

      const w = await ethers.Wallet.fromEncryptedJson(jsonKeystore.trim(), pwdDecrypted);
      setResolvedWallet(w);
      const pk = (w as any).privateKey as string | undefined;
      if (!pk) throw new Error('このアカウントは秘密鍵が取得できません（インポート型のアカウントで試してください）');
      return pk;
    } catch (e: any) {
      throw new Error(e?.message || 'ウォレットの復元に失敗しました');
    }
  };

const start = async () => {
    try {
      const pk = await ensurePrivateKey();
      if (!strategy.targetTokenAddress) throw new Error('交換先トークンを選択してください');
      if (!strategy.baseTokenAddress) throw new Error('交換元通貨を選択してください');

      const rpcUrl = allNetworks[networkKey]?.rpc;
      if (!rpcUrl) throw new Error('RPCが見つかりません');
      botHandleRef.current = startBotLoop({
        privateKey: pk,
        rpcUrl,
        strategy,
        onStatus: setRuntime,
        onError: (e) => setPopup({ title: '自動取引エラー', message: String((e as any)?.details || (e as any)?.message || e) }),
      });
    } catch (e: any) {
      setPopup({
        title: '開始できません',
        message: String(e?.message || '不明なエラーが発生しました。'),
        details: String(e?.stack || e),
      });
    }
  };

  const stop = () => {
    try {
      if (botHandleRef.current) {
        stopBotLoop(botHandleRef.current);
        botHandleRef.current = null;
      }
      setRuntime({ running: false, phase: 'IDLE' });
    } catch (e: any) {
      setPopup({ title: '停止できません', message: e?.message || String(e) });
    }
  };

  const tfButton = (h: 1|12|24, label: string) => (
    <button
      onClick={() => setTfHours(h)}
      className={`px-3 py-1 rounded-lg text-xs border ${tfHours===h ? 'bg-cyan-600/30 border-cyan-300/40 text-cyan-100' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}
    >
      {label}
    </button>
  );

  const title = '自動取引';

  return (
    <PageWrapper title={title} bgImage={runnerBg || bgImage}>
      <Popup
        open={!!popup}
        title={popup?.title || ''}
        message={popup?.message || ''}
        details={popup?.details}
        onClose={() => setPopup(null)}
      />

      <div className="flex flex-col gap-4"><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: settings + logs */}
          <div className="space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-cyan-100">設定</div>
                <div className={`text-xs px-2 py-1 rounded-lg border ${runtime.running ? 'border-green-400/30 text-green-200 bg-green-900/20' : 'border-white/10 text-white/70 bg-white/5'}`}>
                  {runtime.running ? `稼働中: ${runtime.phase}` : '停止中'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-white/70 mb-1">ネットワーク</div>
                  <select value={networkKey} onChange={(e: ChangeEvent<HTMLSelectElement>) => setNetworkKey(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-2 text-sm">
                    {Object.keys(allNetworks).map(k => (
                      <option key={k} value={k}>{allNetworks[k].name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">交換元（Base）</div>
                  <select value={baseTokenAddress} onChange={(e: ChangeEvent<HTMLSelectElement>) => setBaseTokenAddress(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-2 text-sm">
                    <option value="USDC">USDC</option>
                    <option value="NATIVE">Native（{allNetworks[networkKey]?.symbol || 'NATIVE'}）</option>
                    {UNISWAP_ADDRESSES[networkKey]?.WETH ? (
                      <option value={UNISWAP_ADDRESSES[networkKey].WETH}>
                        Wrapped Native（{networkKey === 'polygon' ? 'WMATIC/WPOL' : 'WETH'}）
                      </option>
                    ) : null}

                    {heldTokens.length ? (
                      <optgroup label="所持しているトークン">
                        {heldTokens.map(t => (
                          <option key={`held-${t.address}`} value={t.address}>
                            {t.symbol} - {t.name}（{t.balance}）
                          </option>
                        ))}
                      </optgroup>
                    ) : null}

                    {majorTokens.length ? (
                      <optgroup label="主要トークン">
                        {majorTokens.map(t => (
                          <option key={`major-base-${t.address}`} value={t.address}>{t.symbol} - {t.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">交換先（Target）</div>
                  <select value={targetAddress} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTargetAddress(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-xl p-2 text-sm">
                    <option value="">選択してください</option>
                    {recommended.length ? (
                      <optgroup label="おすすめ（直近24h出来高）">
                        {recommended.map(r => (
                          <option key={`rec-${r.token.address}`} value={r.token.address}>
                            {r.token.symbol} - {r.token.name}（{formatUsd(r.volumeH24Usd)}/24h）
                          </option>
                        ))}
                      </optgroup>
                    ) : null}

                    {heldTokens.length ? (
                      <optgroup label="所持しているトークン">
                        {heldTokens.map(t => (
                          <option key={`held-target-${t.address}`} value={t.address}>
                            {t.symbol} - {t.name}（{t.balance}）
                          </option>
                        ))}
                      </optgroup>
                    ) : null}

                    {majorTokens.length ? (
                      <optgroup label="主要トークン">
                        {majorTokens.map(t => (
                          <option key={`major-target-${t.address}`} value={t.address}>{t.symbol} - {t.name}</option>
                        ))}
                      </optgroup>
                    ) : null}

                    {customTargets.length ? (
                      <optgroup label="指定したアドレスのトークン">
                        {customTargets.map(t => (
                          <option key={`custom-${t.address}`} value={t.address}>{t.symbol} - {t.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>

                  <div className="mt-2 flex gap-2">
                    <Input value={customTargetAddr} onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomTargetAddr(e.target.value)} placeholder="トークンアドレス（0x...）" />
                    <Button variant="secondary" onClick={addCustomTarget}>追加</Button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">投入額（Base）</div>
                  <Input value={amountIn} onChange={(e: ChangeEvent<HTMLInputElement>) => setAmountIn(e.target.value)} placeholder="例: 50" />
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">利確（%）</div>
                  <Input value={String(takeProfitPct)} onChange={(e: ChangeEvent<HTMLInputElement>) => setTakeProfitPct(Number(e.target.value || 0))} placeholder="2" />
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">損切り（%）</div>
                  <Input value={String(stopLossPct)} onChange={(e: ChangeEvent<HTMLInputElement>) => setStopLossPct(Number(e.target.value || 0))} placeholder="2" />
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">再エントリー条件（前回売値から下落%）</div>
                  <Input value={String(reentryDropPct)} onChange={(e: ChangeEvent<HTMLInputElement>) => setReentryDropPct(Number(e.target.value || 0))} placeholder="1" />
                </div>

                <div>
                  <div className="text-xs text-white/70 mb-1">判定間隔（秒）</div>
                  <Input value={String(pollSeconds)} onChange={(e: ChangeEvent<HTMLInputElement>) => setPollSeconds(Math.max(10, Number(e.target.value || 10)))} placeholder="10" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {!runtime.running ? (
                  <Button onClick={start}>開始</Button>
                ) : (
                  <Button onClick={stop} variant="secondary">停止</Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    const url = chrome.runtime.getURL('index.html');
                    if (chrome.tabs?.create) chrome.tabs.create({ url });
                    else window.open(url, '_blank');
                  }}
                >
                  メインへ
                </Button>

                <label className="text-xs text-white/70 ml-auto flex items-center gap-2">
                  背景画像
                  <input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => handleSetRunnerBg(e.target.files?.[0])} className="text-xs" />
                  <button className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10" onClick={() => handleSetRunnerBg(undefined)}>クリア</button>
                </label>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-cyan-100">取引ログ</div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={async () => { await clearTradeLog(); setTradeLog([]); }}>
                    履歴リセット
                  </Button>
                </div>
                <div className={`text-sm font-bold ${pnlUsd.total >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  合計 {pnlUsd.total >= 0 ? '+' : ''}{pnlUsd.total.toFixed(2)} USD
                </div>
              </div>
              <div className="text-xs text-white/60 mt-1">勝ち {pnlUsd.wins} / 負け {pnlUsd.losses}</div>

              <div className="mt-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                {tradeLog.length === 0 ? (
                  <div className="text-xs text-white/60">まだ取引ログはありません</div>
                ) : (
                  <div className="space-y-2">
                    {[...tradeLog].slice(-50).reverse().map((e, idx) => {
                      const time = new Date(e.t).toLocaleString();
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                          <div className="flex flex-col">
                            <div className="text-xs text-white/80">{time}</div>
                            <div className="text-sm font-semibold">
                              {e.kind === 'ENTRY' ? 'BUY' : 'SELL'} {selectedTarget?.symbol || ''} / {baseLabel}
                            </div>
                            {typeof e.priceBasePerTarget === 'number' && (
                              <div className="text-xs text-white/60">
                                price ≈ {e.priceBasePerTarget.toLocaleString(undefined,{maximumFractionDigits: 8})} {baseLabel} per {selectedTarget?.symbol || 'TOKEN'}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            {e.txHash ? (
                              <div className="text-xs font-mono text-cyan-200">{e.txHash.slice(0,8)}…{e.txHash.slice(-6)}</div>
                            ) : (
                              <div className="text-xs text-white/40">txなし</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Right: charts */}
          <div className="space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-cyan-100">チャート</div>
                <div className="flex gap-2">
                  {tfButton(1,'1時間')}
                  {tfButton(12,'12時間')}
                  {tfButton(24,'24時間')}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <PriceChart
                  title={`Base: ${baseLabel} / USD`}
                  points={filteredBasePoints}
                  markers={markers}
                  valueSuffix=""
                />
                <PriceChart
                  title={`Target: ${selectedTarget?.symbol || '—'} / USD`}
                  points={filteredTargetPoints}
                  markers={markers}
                  valueSuffix=""
                />
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};