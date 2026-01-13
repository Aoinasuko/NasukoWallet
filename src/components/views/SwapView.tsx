import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wrapper } from '../Layout';
import { GlassCard, Button, Input, Popup } from '../UI';
import { executeSwap, getSwapQuote } from '../../services/swapService';
import { getBridgeQuote, executeBridge } from '../../services/bridgeService';
import { fetchTokenMetadataAndPrice } from '../../alchemy';
import { MAJOR_TOKENS_LIST } from '../../constants';
import { calculateSwapProfit, type ProfitCalculationResult } from '../../services/profitService';
import { fetchCurrentPrice } from '../../services/priceService'; // ★追加
import type { TxHistory, TokenData } from '../../types';

export const SwapView = (props: any) => {
  const {
    networkKey,
    allNetworks,
    mainNetwork,
    setView,
    wallet,
    onSwap,
    txHistory,
    currentPrice,
    mainCurrencyPrice
  } = props;
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [loading, setLoading] = useState(false);

  const [fromType, setFromType] = useState<'native' | 'token'>('native');
  const [selectedFromToken, setSelectedFromToken] = useState<TokenData | null>(null);

  const [toNetworkKey, setToNetworkKey] = useState<string>(networkKey);

  const [toInput, setToInput] = useState<string>(''); 
  const [searchedToken, setSearchedToken] = useState<any>(null); 
  const [isSearching, setIsSearching] = useState(false);

  const [fetchedFromPrice, setFetchedFromPrice] = useState<number | null>(null);
  const [comparisonData, setComparisonData] = useState<ProfitCalculationResult | null>(null);

  const [amount, setAmount] = useState<string>('0');
  const [balance, setBalance] = useState<string>('0');
  const [estimatedFee, setEstimatedFee] = useState('0');

  // エラーポップアップ（システムalertではなくUIに合わせたデザイン）
  const [popup, setPopup] = useState<{ open: boolean; title?: string; message?: string; details?: string; primaryLabel?: string; secondaryLabel?: string }>(
    { open: false }
  );
  const [popupAfterClose, setPopupAfterClose] = useState<null | (() => void)>(null);
  const closePopup = () => {
    setPopup({ open: false });
    const fn = popupAfterClose;
    setPopupAfterClose(null);
    if (fn) fn();
  };
  const showError = (title: string, message: string, err?: any) => {
    const details = err ? (err?.reason || err?.message || String(err)) : undefined;
    setPopup({ open: true, title, message, details, primaryLabel: 'OK' });
  };

  const net = allNetworks[networkKey];
  const mainNet = allNetworks[mainNetwork] || net;
  const majorTokens = MAJOR_TOKENS_LIST[networkKey] || [];
  const toNet = allNetworks[toNetworkKey] || net;
  const majorTokensTo = MAJOR_TOKENS_LIST[toNetworkKey] || [];

  // App から渡される所持トークン一覧（Alchemy などで取得）
  const heldTokens: TokenData[] = Array.isArray(props.tokenList) ? props.tokenList : [];

  // 主要トークンの「実際の残高」を反映する（所持していれば balance/market/logo を優先）
  const heldMap = new Map<string, TokenData>(
    heldTokens
      .filter((t: any) => t?.address)
      .map((t: TokenData) => [t.address.toLowerCase(), t])
  );
  const majorAddrSetFrom = new Set<string>(majorTokens.map((t: any) => (t.address || '').toLowerCase()).filter(Boolean));
  const majorAddrSetTo = new Set<string>(majorTokensTo.map((t: any) => (t.address || '').toLowerCase()).filter(Boolean));

  // 交換元に出す一覧: 主要トークン + 主要以外の所持トークン(Held)
  const fromTokenList: TokenData[] = [
    ...majorTokens.map((t: any) => {
      const addr = (t.address || '').toLowerCase();
      const held = addr ? heldMap.get(addr) : undefined;
      return (
        held ||
        ({
          ...t,
          balance: '0',
          logo: t.logo || '',
        } as TokenData)
      );
    }),
    ...heldTokens.filter((t: any) => t?.address && !majorAddrSetFrom.has(t.address.toLowerCase())),
  ];

  // 交換先に出す「所持トークン」欄は、同一ネットワークのときだけ表示する。
  // (異なるネットワークに対して現在の所持トークンを "Held" と表示すると誤解を招くため)
  const heldNonMajorForTo =
    toNetworkKey === networkKey
      ? heldTokens.filter((t: any) => t?.address && !majorAddrSetTo.has(t.address.toLowerCase()))
      : [];

  // ★改善: クォート(見積)結果を保持
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [bridgeQuote, setBridgeQuote] = useState<any>(null);
  const [bridgeExpectedOut, setBridgeExpectedOut] = useState<string | null>(null);
  const [_quoteFeeTier, setQuoteFeeTier] = useState<number | null>(null);

  // Balance Update
  useEffect(() => {
    const updateBalance = async () => {
      if (fromType === 'native') {
        const provider = new ethers.JsonRpcProvider(net.rpc);
        const bal = await provider.getBalance(wallet.address);
        setBalance(ethers.formatEther(bal));
        setFetchedFromPrice(currentPrice?.usd || 0);
      } else if (selectedFromToken) {
        setBalance(selectedFromToken.balance);
        const price = selectedFromToken.market?.usd.price || 0;
        setFetchedFromPrice(price);
        
        if (price === 0 && selectedFromToken.address) {
           fetchTokenMetadataAndPrice(selectedFromToken.address, networkKey).then(res => {
               if (res && res.price && res.price.usd > 0) {
                   setFetchedFromPrice(res.price.usd);
               }
           });
        }
      }
    };
    updateBalance();
  }, [fromType, selectedFromToken, networkKey, wallet.address, net.rpc, currentPrice]);

  useEffect(() => {
    const searchToken = async () => {
      if (!ethers.isAddress(toInput)) {
        setSearchedToken(null);
        return;
      }
      setIsSearching(true);
      const info = await fetchTokenMetadataAndPrice(toInput, toNetworkKey);
      setSearchedToken(info);
      setIsSearching(false);
    };
    const timer = setTimeout(searchToken, 500);
    return () => clearTimeout(timer);
  }, [toInput, networkKey]);

  // ★追加: 確認画面での5秒定期更新
  useEffect(() => {
    if (step !== 'confirm') return;

    const refreshData = async () => {
      // 1. Toトークン価格更新
      const toInfo = await fetchTokenMetadataAndPrice(toInput, toNetworkKey);
      
      // 2. Fromトークン価格更新
      let newFromPrice = 0;
      let newCurrentPrice = currentPrice;

      // Native価格の更新
      if (net.coingeckoId) {
          const cp = await fetchCurrentPrice(net.coingeckoId);
          if (cp) newCurrentPrice = cp;
      }

      if (fromType === 'native') {
          newFromPrice = newCurrentPrice?.usd || 0;
      } else if (selectedFromToken?.address) {
          const res = await fetchTokenMetadataAndPrice(selectedFromToken.address, networkKey);
          newFromPrice = res?.price?.usd || 0;
      }

      // 3. 再計算
      const result = await calculateSwapProfit({
        amount,
        fromType,
        selectedFromToken,
        searchedToken: toInfo || searchedToken,
        toInput,
        net,
        mainNet,
        majorTokens,
        currentPrice: newCurrentPrice, // 最新のNative価格
        mainCurrencyPrice,
        txHistory,
        fetchedFromPrice: newFromPrice,
        expectedReceivedAmount: quoteOut
      });

      // 4. State更新
      if (toInfo) setSearchedToken(toInfo);
      if (newFromPrice > 0) setFetchedFromPrice(newFromPrice);
      setComparisonData(result);
    };

    const interval = setInterval(refreshData, 5000); // 5秒ごとに更新
    return () => clearInterval(interval);
  }, [step, toInput, networkKey, fromType, selectedFromToken, amount, net, mainNet, majorTokens, txHistory, mainCurrencyPrice, currentPrice]);


  const handleSelectFrom = (e: any) => {
    const val = e.target.value;
    if (val === 'NATIVE') {
      setFromType('native');
      setSelectedFromToken(null);
    } else {
      const token = fromTokenList.find((t: TokenData) => t.address === val);
      if (token) {
        setFromType('token');
        setSelectedFromToken(token);
      }
    }
  };

  const handleSelectTo = (e: any) => {
    const val = e.target.value;
    if (val === 'custom') return;
    setToInput(val);
  };

  const handlePercentInput = (percent: number) => {
    if (!balance) return;
    const balVal = parseFloat(balance);
    if (isNaN(balVal) || balVal <= 0) return;
    const val = balVal * (percent / 100);
    setAmount(val.toString());
  };

  // ブリッジ時は、交換先ネットワークのネイティブ通貨も候補に追加する
  // (LI.FI API では EVM ネイティブを 0x000...000 で表現)
  const toNativeToken =
    toNetworkKey === networkKey
      ? null
      : ({
          symbol: toNet.symbol,
          address: ethers.ZeroAddress,
          name: `${toNet.name} Native`,
          type: 'Major',
        } as any);

  const availableToTokens = [
    ...(toNativeToken ? [toNativeToken] : []),
    // 主要トークンは必ず Major に残す
    ...majorTokensTo.map((t: any) => ({ symbol: t.symbol, address: t.address, name: t.name, type: 'Major' })),
    // 同一ネットワークのときだけ、主要以外の所持トークンを Held として出す
    ...heldNonMajorForTo.map((t: TokenData) => ({ symbol: t.symbol, address: t.address, name: t.name, type: 'Held' })),
  ];

  // 念のため重複排除（同じアドレスが来ても Major を優先）
  const uniqueToTokens = Array.from(
    availableToTokens.reduce((m: Map<string, any>, item: any) => {
      const key = (item.address || '').toLowerCase();
      if (!key) return m;
      const existing = m.get(key);
      if (!existing) {
        m.set(key, item);
      } else if (existing.type !== 'Major' && item.type === 'Major') {
        m.set(key, item);
      }
      return m;
    }, new Map<string, any>()).values()
  );

  const handleProceed = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      showError('入力エラー', '金額を入力してください');
      return;
    }
    if (!ethers.isAddress(toInput)) {
      showError('入力エラー', '交換先トークンを選択、または正しいアドレスを入力してください');
      return;
    }

    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(net.rpc);
      const feeData = await provider.getFeeData();
      const fee = (feeData.gasPrice || BigInt(0)) * BigInt(200000);
      setEstimatedFee(ethers.formatEther(fee));
      // ★改善: 事前にクォート(見積)を取得し、総額損益を受取量ベースで計算できるようにする
      setBridgeQuote(null);
      setBridgeExpectedOut(null);
      const fromAddrQ = fromType === 'native' ? 'NATIVE' : selectedFromToken!.address;
      const toAddrQ = toInput;
      const isNativeQ = fromType === 'native';

      if (toNetworkKey === networkKey) {
        const q = await getSwapQuote(wallet, networkKey, fromAddrQ, toAddrQ, amount, isNativeQ);
        setQuoteFeeTier(q.bestFee);
        const decimalsTo = searchedToken?.decimals || 18;
        const qOut = ethers.formatUnits(q.amountOutRaw, decimalsTo);
        setQuoteOut(qOut);
      } else {
        // Bridge (LI.FI): cross-chain or cross-chain swap
        const fromChainId = net.chainId;
        const toChainId = toNet.chainId;

        // decimals
        let decimalsFrom = 18;
        if (!isNativeQ) {
          const metaFrom = await fetchTokenMetadataAndPrice(fromAddrQ, networkKey);
          decimalsFrom = metaFrom?.decimals ?? 18;
        }
        const metaTo = await fetchTokenMetadataAndPrice(toAddrQ, toNetworkKey);
        const decimalsTo = metaTo?.decimals ?? 18;

        const fromAmountRaw = isNativeQ ? ethers.parseEther(amount) : ethers.parseUnits(amount, decimalsFrom);
        const fromTokenAddress = isNativeQ ? '0x0000000000000000000000000000000000000000' : fromAddrQ;

        const q = await getBridgeQuote({
          fromChainId,
          toChainId,
          fromTokenAddress,
          toTokenAddress: toAddrQ,
          fromAmount: fromAmountRaw.toString(),
          fromAddress: wallet.address,
          toAddress: wallet.address,
          slippage: 0.003,
        });

        setBridgeQuote(q);
        const outMin = q.estimate?.toAmountMin || q.estimate?.toAmount;
        const outFormatted = ethers.formatUnits(outMin, decimalsTo);
        setBridgeExpectedOut(outFormatted);
        setQuoteOut(outFormatted);
      }
const result = await calculateSwapProfit({
        amount,
        fromType,
        selectedFromToken,
        searchedToken,
        toInput,
        net,
        mainNet,
        majorTokens,
        currentPrice,
        mainCurrencyPrice,
        txHistory,
        fetchedFromPrice,
        expectedReceivedAmount: quoteOut || bridgeExpectedOut || null
      });
      
      setComparisonData(result);
      setStep('confirm');
    } catch (e) {
      console.error(e);
      showError('確認画面への移行に失敗', '見積の取得または損益計算でエラーが発生しました。入力内容やRPC接続を確認してください。', e);
    }
    setLoading(false);
  };

  const handleExecute = async () => {
    try {
      setLoading(true);
      const fromAddr = fromType === 'native' ? 'NATIVE' : selectedFromToken!.address;
      const toAddr = toInput;
      const isNative = fromType === 'native';

      let tx: any;
      let amountOutRaw: bigint = BigInt(0);
      let quoteOutRaw: bigint | null = null;

      if (toNetworkKey === networkKey) {
        const r = await executeSwap(wallet, networkKey, fromAddr, toAddr, amount, isNative);
        tx = r.tx;
        amountOutRaw = r.amountOutRaw;
        quoteOutRaw = r.quoteOutRaw;
      } else {
        if (!bridgeQuote) throw new Error('Bridge quote is missing. Please retry from the input step.');
        const r = await executeBridge({ wallet, rpcUrl: net.rpc, quote: bridgeQuote, fromTokenIsNative: isNative });
        tx = r.tx;
        // LI.FI quote gives expected toAmountMin; use it as displayed received amount
        try {
          amountOutRaw = BigInt(bridgeQuote.estimate?.toAmountMin || bridgeQuote.estimate?.toAmount || '0');
          quoteOutRaw = amountOutRaw;
        } catch {
          amountOutRaw = BigInt(0);
          quoteOutRaw = null;
        }
      }
const fromSym = fromType === 'native' ? net.symbol : selectedFromToken!.symbol;
      const toSym = searchedToken ? searchedToken.symbol : "Unknown";
      const decimalsTo = searchedToken?.decimals ?? 18;
      const amountOutVal = parseFloat(ethers.formatUnits(amountOutRaw, decimalsTo));
      const amountInVal = parseFloat(amount);
      const rate = amountInVal > 0 ? amountOutVal / amountInVal : 0;
      
      const fromPriceUsd = fromType === 'native' ? (currentPrice?.usd || 0) : (selectedFromToken?.market?.usd.price || 0);

      // ★改善: Toトークン側の実行時単価も保存（買い(Stable->Crypto)で必要）
      let toPriceUsd = searchedToken?.market?.usd?.price || 0;
      if (toPriceUsd === 0 && toAddr && ethers.isAddress(toAddr)) {
        try {
          const res = await fetchTokenMetadataAndPrice(toAddr, toNetworkKey);
          if (res?.price?.usd) toPriceUsd = res.price.usd;
        } catch {}
      }

      const isFromStable = ['USDC','USDT','DAI'].includes(fromSym);
      const isToStable = ['USDC','USDT','DAI'].includes(toSym);
      const priceBasis = (isFromStable && !isToStable) ? 'to' : 'from';
      const priceBasisSymbol = priceBasis === 'to' ? toSym : fromSym;
      const priceInUsdBasis = priceBasis === 'to' ? toPriceUsd : fromPriceUsd;

      // Bridge quote summary (for history / UI)
      const estDuration = (toNetworkKey === networkKey ? undefined : (bridgeQuote?.estimate?.executionDuration ?? undefined));
      const estFeeUsd = (toNetworkKey === networkKey ? undefined : (Array.isArray(bridgeQuote?.estimate?.feeCosts) ? bridgeQuote.estimate.feeCosts.reduce((s: number, f: any) => s + Number(f?.amountUSD || 0), 0) : undefined));
      const estGasUsd = (toNetworkKey === networkKey ? undefined : (Array.isArray(bridgeQuote?.estimate?.gasCosts) ? bridgeQuote.estimate.gasCosts.reduce((s: number, g: any) => s + Number(g?.amountUSD || 0), 0) : undefined));

      const newTx: TxHistory = {
        id: crypto.randomUUID(),
        hash: tx.hash,
        type: (toNetworkKey === networkKey ? 'swap' : 'bridge') as any,
        amount: amount,
        symbol: `${fromSym} > ${toSym}`,
        from: wallet.address,
        to: toSym,
        date: new Date().toLocaleString('ja-JP'),
        network: net.name,
        toNetwork: (toNetworkKey === networkKey ? undefined : toNet.name),
        fromNetworkKey: networkKey,
        toNetworkKey: toNetworkKey,
        fromChainId: net.chainId,
        toChainId: toNet.chainId,
        bridgeTool: (toNetworkKey === networkKey ? undefined : (bridgeQuote?.tool || bridgeQuote?.toolDetails?.name || 'lifi')),
        lifiStepId: (toNetworkKey === networkKey ? undefined : bridgeQuote?.id),
        bridgeStatus: (toNetworkKey === networkKey ? undefined : 'PENDING'),
        estimatedDurationSeconds: estDuration,
        estimatedFeeUsd: estFeeUsd,
        estimatedGasUsd: estGasUsd,
        receivedAmount: ethers.formatUnits(amountOutRaw, decimalsTo),
        exchangeRate: rate,
        priceInUsd: priceInUsdBasis,
        priceBasis,
        priceBasisSymbol,
        priceInUsdFrom: fromPriceUsd,
        priceInUsdTo: toPriceUsd,
        quotedReceivedAmount: quoteOutRaw ? ethers.formatUnits(quoteOutRaw, decimalsTo) : undefined, 
      };

      onSwap(newTx);
      setPopupAfterClose(() => () => setView('history'));
      setPopup({ open: true, title: 'スワップ完了', message: '取引が完了しました。履歴画面に移動します。', primaryLabel: 'OK' });
    } catch (e: any) {
      console.error(e);
      showError('スワップ実行に失敗', '取引を完了できませんでした。残高・ガス代・スリッページ設定などを確認してください。', e);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'input') {
    return (
      <Wrapper title="スワップ" backAction={() => setView('home')}>
        <GlassCard>
          <div className="flex justify-between items-end mb-1">
             <p className="text-xs text-slate-400">交換元 (Balance: {parseFloat(balance).toFixed(4)})</p>
             <div className="flex gap-1">
               <button onClick={() => handlePercentInput(25)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">25%</button>
               <button onClick={() => handlePercentInput(50)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">50%</button>
               <button onClick={() => handlePercentInput(100)} className="text-[10px] bg-slate-800 px-2 py-1 rounded hover:bg-slate-700 text-cyan-200">MAX</button>
             </div>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <Input value={amount} onChange={(e: any) => setAmount(e.target.value)} type="number" placeholder="0.0" />
            </div>
            <select className="bg-slate-800 text-white p-2 rounded w-32 text-sm border border-slate-600" onChange={handleSelectFrom} value={fromType === 'native' ? 'NATIVE' : selectedFromToken?.address}>
              <option value="NATIVE">{net.symbol} (Native)</option>
              {fromTokenList.map((t: TokenData) => {
                const isHeldNonMajor = !!t.address && !majorAddrSetFrom.has(t.address.toLowerCase());
                return (
                  <option key={t.address} value={t.address}>
                    {t.symbol}{isHeldNonMajor ? ' (Held)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex justify-center mb-4 text-2xl text-slate-600">↓</div>
          <p className="text-xs text-slate-400 mb-1">交換先</p>
          <p className="text-xs text-slate-400 mb-1">交換先ネットワーク</p>
          <div className="mb-3">
            <select
              className="w-full bg-slate-800 text-white p-2 rounded-md border border-slate-700"
              value={toNetworkKey}
              onChange={(e: any) => {
                const k = e.target.value;
                setToNetworkKey(k);
                // ネットワークが変わったら To トークンをリセット（アドレスが別チェーンになるため）
                setToInput('');
                setSearchedToken(null);
                setBridgeQuote(null);
                setBridgeExpectedOut(null);
                setQuoteOut(null);
              }}
            >
              {Object.keys(allNetworks).map((k: string) => (
                <option key={k} value={k}>
                  {allNetworks[k].name}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-slate-500 mt-1">デフォルトは同一ネットワークです。異なるネットワークを選ぶとブリッジとして実行します。</div>
          </div>

          
          <div className="mb-2">
            <select className="w-full bg-slate-800 text-white p-2 rounded text-sm border border-slate-600 mb-2" onChange={handleSelectTo} value={uniqueToTokens.some((t: any) => t.address === toInput) ? toInput : 'custom'}>
              <option value="" disabled>トークンを選択してください</option>
              <optgroup label="主要トークン">{uniqueToTokens.filter((t: any) => t.type === 'Major').map((t: any) => (<option key={t.address} value={t.address}>{t.symbol} - {t.name}</option>))}</optgroup>
              {uniqueToTokens.some((t: any) => t.type === 'Held') && (
                <optgroup label="所持トークン">{uniqueToTokens.filter((t: any) => t.type === 'Held').map((t: any) => (<option key={t.address} value={t.address}>{t.symbol} (Held)</option>))}</optgroup>
              )}
              <option value="custom">手動入力 (カスタム)</option>
            </select>
            <Input value={toInput} onChange={(e: any) => setToInput(e.target.value)} placeholder="トークンアドレス (0x...)" className="text-xs font-mono" />
          </div>
          <div className="mb-6 h-16">
            {isSearching && <div className="text-xs text-cyan-400 mt-1 animate-pulse">Searching info...</div>}
            {searchedToken && (
              <div className="mt-1 p-2 bg-slate-900/80 rounded border border-cyan-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {searchedToken?.logo && <img src={searchedToken.logo} className="w-6 h-6 rounded-full" />}
                  <div><div className="text-sm font-bold text-cyan-100">{searchedToken.name} ({searchedToken.symbol})</div><div className="text-[10px] text-slate-400">Decimals: {searchedToken?.decimals ?? 18}</div></div>
                </div>
                <div className="text-right"><div className="text-xs text-white">Price:</div><div className="text-[10px] text-slate-400">${searchedToken?.price.usd} / ¥{searchedToken?.price.jpy}</div></div>
              </div>
            )}
          </div>
          <Button onClick={handleProceed} disabled={loading || !amount || !toInput || parseFloat(amount) <= 0}>確認画面へ</Button>
        </GlassCard>

        <Popup
          open={popup.open}
          title={popup.title}
          message={popup.message}
          details={popup.details}
          primaryLabel={popup.primaryLabel}
          secondaryLabel={popup.secondaryLabel}
          onClose={closePopup}
        />
      </Wrapper>
    );
  }

  // CONFIRM SECTION
  return (
    <Wrapper title="確認" backAction={() => setStep('input')}>
      <GlassCard>
        <div className="space-y-4 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Swap From</span>
            <span className="font-bold text-white">{amount} {fromType === 'native' ? net.symbol : selectedFromToken?.symbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Swap To</span>
            <span className="font-bold text-cyan-300">{searchedToken ? `${searchedToken.symbol}` : toInput.slice(0, 6) + '...'}</span>
          </div>

          {toNetworkKey !== networkKey && bridgeQuote && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mt-2 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">To Network</span>
                <span className="text-white font-semibold">{toNet.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Bridge / Tool</span>
                <span className="text-white font-semibold">{bridgeQuote.toolDetails?.name || bridgeQuote.tool || 'LI.FI'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Min Receive (Quote)</span>
                <span className="text-cyan-300 font-semibold">{bridgeExpectedOut} {searchedToken?.symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Estimated Time</span>
                <span className="text-white font-semibold">
                  {bridgeQuote.estimate?.executionDuration ? `${Math.max(1, Math.round(bridgeQuote.estimate.executionDuration / 60))} min` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Fee (USD)</span>
                <span className="text-white font-semibold">
                  {Array.isArray(bridgeQuote.estimate?.feeCosts) ? `$${bridgeQuote.estimate.feeCosts.reduce((s: number, f: any) => s + Number(f?.amountUSD || 0), 0).toFixed(4)}` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Gas (USD)</span>
                <span className="text-white font-semibold">
                  {Array.isArray(bridgeQuote.estimate?.gasCosts) ? `$${bridgeQuote.estimate.gasCosts.reduce((s: number, g: any) => s + Number(g?.amountUSD || 0), 0).toFixed(4)}` : '-'}
                </span>
              </div>
            </div>
          )}

          {comparisonData && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-700 mt-2 space-y-3">
              <div>
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">Unit Price {comparisonData.isPrediction && "(Est)"}</span>
                    <span 
                        className={`font-bold ${comparisonData.unitProfitColor} cursor-help`}
                        title={comparisonData.reason || "直近の逆方向取引と比較しています"}
                    >
                        {comparisonData.unitProfitPercent}
                    </span>
                 </div>
                 <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span className="break-all w-[48%]">Past: {comparisonData.displayHistUnitPrice}</span>
                    <span className="break-all w-[48%] text-right">Now: {comparisonData.displayCurrUnitPrice}</span>
                 </div>
              </div>
              <div className="h-px bg-slate-800"></div>
              <div>
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400">Total Value Diff</span>
                      <span className={`font-bold ${comparisonData.totalProfitColor}`}>{comparisonData.totalProfitPercent}</span>
                  </div>
                  <div className="bg-slate-950/50 p-2 rounded text-[10px] font-mono space-y-1">
                      <div className="flex justify-between">
                          <span className="text-slate-500 min-w-[30px]">Past:</span>
                          <span className="text-slate-300 break-all text-right">${comparisonData.totalPrevUsdDisplay}</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-slate-500 min-w-[30px]">Now:</span>
                          <span className="text-cyan-200 break-all text-right">${comparisonData.totalCurrUsdDisplay}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-1 mt-1">
                          <span className="text-slate-500">Diff:</span>
                          <div className="text-right w-full">
                              <div className={`${comparisonData.totalProfitColor} break-all`}>${comparisonData.totalDiffUsd}</div>
                              <div className={`${comparisonData.totalProfitColor} break-all`}>¥{comparisonData.totalDiffJpy}</div>
                          </div>
                      </div>
                  </div>
              </div>
              <div className="h-px bg-slate-800"></div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span>Est. Value ({mainNet.symbol}):</span>
                  <span className="text-cyan-200 font-mono">{comparisonData.diffValueMain}</span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
            <span className="text-slate-400">Est. Gas Fee</span>
            <span className="font-mono text-red-300">{estimatedFee.slice(0, 8)} {net.symbol}</span>
          </div>
        </div>

        <Button onClick={handleExecute} disabled={loading}>
          {loading ? "処理中..." : "スワップ実行"}
        </Button>
      </GlassCard>

      <Popup
        open={popup.open}
        title={popup.title}
        message={popup.message}
        details={popup.details}
        primaryLabel={popup.primaryLabel}
        secondaryLabel={popup.secondaryLabel}
        onClose={closePopup}
      />
    </Wrapper>
  );
};