import { ethers } from 'ethers';
import { executeSwap, getSwapQuote } from './swapService';
import { getTokenPriceUsdCached } from './tokenPriceCache';
import { UNISWAP_ADDRESSES } from '../constants';

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export type BotStrategy = {
  networkKey: string;
  /** 'NATIVE' or 'USDC' (network default) */
  baseTokenAddress: 'NATIVE' | 'USDC' | string;
  baseTokenSymbol: string;
  targetTokenAddress: string;
  targetTokenSymbol: string;
  amountIn: string;
  takeProfitPct: number;
  stopLossPct: number;
  reentryDropPct: number;
  pollSeconds: number;
};

export type StoredBotKey = { ciphertext: string };

export type BotRuntimeStatus = {
  running: boolean;
  phase: 'IDLE' | 'WAIT_ENTRY' | 'ENTERING' | 'HOLDING' | 'EXITING' | 'ERROR';
  lastPrice?: number; // base per target
  entryPrice?: number;
  lastExitPrice?: number;
  lastTxHash?: string;
  message?: string;
};

export type BotTradeEvent = {
  t: number;
  kind: 'ENTRY' | 'EXIT';
  txHash?: string;
  priceBasePerTarget?: number;
};

type StartArgs = {
  privateKey: string;
  rpcUrl: string;
  strategy: BotStrategy;
  onStatus: (s: BotRuntimeStatus) => void;
  onError: (e: { message: string; details?: string }) => void;
  onTrade?: (e: BotTradeEvent) => void;
};

export type BotLoopHandle = {
  stop: () => void;
};

type PersistedBotState = {
  phase: BotRuntimeStatus['phase'];
  entryPrice?: number;
  lastExitPrice?: number;
  lastTxHash?: string;
  pendingSince?: number;
  pendingKind?: 'ENTRY' | 'EXIT';
  // Only log trades after confirmation (balance observed). These hold the
  // pending tx metadata while ENTERING/EXITING.
  pendingTxHash?: string;
  pendingPriceBasePerTarget?: number;
};

const BOT_STATE_KEY = 'botState';
const BOT_TRADE_LOG_KEY = 'botTradeLog';

// Safety guards against repeated actions while a tx is pending or RPC is lagging.
const ACTION_COOLDOWN_MS = 30_000;     // min time between entry/exit actions
const PENDING_TIMEOUT_MS = 5 * 60_000; // fail-safe: pending state timeout

const readState = async (): Promise<PersistedBotState> => {
  const local = await chrome.storage.local.get([BOT_STATE_KEY]);
  return (local[BOT_STATE_KEY] as PersistedBotState) || { phase: 'WAIT_ENTRY' };
};

const writeState = async (s: PersistedBotState) => {
  await chrome.storage.local.set({ [BOT_STATE_KEY]: s });
};

const appendTradeLog = async (e: BotTradeEvent) => {
  try {
    const local = await chrome.storage.local.get([BOT_TRADE_LOG_KEY]);
    const existing = (local[BOT_TRADE_LOG_KEY] as BotTradeEvent[] | undefined) || [];
    const next = [...existing, e].slice(-500); // keep last 500
    await chrome.storage.local.set({ [BOT_TRADE_LOG_KEY]: next });
  } catch {
    // ignore
  }
};

export const readTradeLog = async (): Promise<BotTradeEvent[]> => {
  try {
    const local = await chrome.storage.local.get([BOT_TRADE_LOG_KEY]);
    return ((local[BOT_TRADE_LOG_KEY] as BotTradeEvent[] | undefined) || []).slice();
  } catch {
    return [];
  }
};

export const clearTradeLog = async () => {
  await chrome.storage.local.remove(BOT_TRADE_LOG_KEY);
};

const resolveBaseToken = (networkKey: string, baseTokenAddress: string) => {
  if (baseTokenAddress === 'NATIVE') return { address: 'NATIVE', isNative: true };
  if (baseTokenAddress === 'USDC') {
    const a = UNISWAP_ADDRESSES[networkKey]?.USDC;
    if (!a) throw new Error('USDC address is not configured for this network');
    return { address: a, isNative: false };
  }
  return {
    address: baseTokenAddress,
    isNative: baseTokenAddress === 'NATIVE' || baseTokenAddress === ethers.ZeroAddress,
  };
};

const getErc20Decimals = async (provider: ethers.Provider, token: string): Promise<number> => {
  try {
    return await new ethers.Contract(token, ERC20_ABI, provider).decimals();
  } catch {
    return 18;
  }
};

const getErc20Balance = async (provider: ethers.Provider, token: string, owner: string): Promise<bigint> => {
  try {
    return await new ethers.Contract(token, ERC20_ABI, provider).balanceOf(owner);
  } catch {
    return 0n;
  }
};

// Returns price (base per 1 target) using a quote.
const getPriceBasePerTarget = async (
  wallet: ethers.Wallet,
  networkKey: string,
  base: { address: string; isNative: boolean },
  targetAddress: string,
  amountInBase: string,
) => {
  let quote;
  try {
    quote = await getSwapQuote(
      wallet,
      networkKey,
      base.address,
      targetAddress,
      amountInBase,
      base.isNative
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    // If Uniswap V3 has no pool, fall back to DexScreener USD prices.
    if (msg.includes('有効な流動性プールが見つかりませんでした')) {
      const uni = UNISWAP_ADDRESSES[networkKey] as any;
      const isUsdc = (addr: string) => {
        const a = addr.toLowerCase();
        return [uni?.USDC, uni?.USDC_NATIVE, uni?.USDC_E]
          .filter(Boolean)
          .some((x: string) => x.toLowerCase() === a);
      };

      const baseAddrForPrice = base.isNative ? (uni?.WETH as string) : base.address;
      const targetAddrForPrice =
        targetAddress === 'NATIVE' || targetAddress === ethers.ZeroAddress
          ? (uni?.WETH as string)
          : targetAddress;

      const baseUsd = baseAddrForPrice
        ? (isUsdc(baseAddrForPrice) ? 1 : await getTokenPriceUsdCached({ networkKey, tokenAddress: baseAddrForPrice }))
        : null;
      const targetUsd = targetAddrForPrice
        ? (isUsdc(targetAddrForPrice) ? 1 : await getTokenPriceUsdCached({ networkKey, tokenAddress: targetAddrForPrice }))
        : null;

      if (!baseUsd || !targetUsd || baseUsd <= 0 || targetUsd <= 0) {
        throw new Error(`Price fallback failed (baseUsd=${baseUsd}, targetUsd=${targetUsd})`);
      }
      return targetUsd / baseUsd;
    }
    throw e;
  }

  const provider = wallet.provider;
  if (!provider) throw new Error('Bot wallet has no provider');

  const baseDecimals = base.isNative ? 18 : await getErc20Decimals(provider, base.address);
  const targetDecimals = await getErc20Decimals(provider, targetAddress);

  const amountIn = Number(ethers.formatUnits(ethers.parseUnits(amountInBase, baseDecimals), baseDecimals));
  const out = Number(ethers.formatUnits(quote.amountOutRaw, targetDecimals));
  if (!out || out <= 0) throw new Error('Quote output is zero');
  return amountIn / out;
};

export const startBotLoop = (args: StartArgs): BotLoopHandle => {
  let stopped = false;

  const provider = new ethers.JsonRpcProvider(args.rpcUrl);
  const wallet = new ethers.Wallet(args.privateKey, provider);

  const status: BotRuntimeStatus = { running: true, phase: 'WAIT_ENTRY' };
  args.onStatus({ ...status });

  const tick = async () => {
    if (stopped) return;

    try {
      const persisted = await readState();
      status.phase = persisted.phase || 'WAIT_ENTRY';
      status.entryPrice = persisted.entryPrice;
      status.lastExitPrice = persisted.lastExitPrice;
      status.lastTxHash = persisted.lastTxHash;

      const base = resolveBaseToken(args.strategy.networkKey, args.strategy.baseTokenAddress);
      const targetDecimals = await getErc20Decimals(provider, args.strategy.targetTokenAddress);

      const targetBal = await getErc20Balance(provider, args.strategy.targetTokenAddress, wallet.address);
      const targetBalFloat = Number(ethers.formatUnits(targetBal, targetDecimals));
      const holdingTarget = targetBalFloat > 0.000001; // dust threshold

      const price = await getPriceBasePerTarget(
        wallet,
        args.strategy.networkKey,
        base,
        args.strategy.targetTokenAddress,
        args.strategy.amountIn
      );
      status.lastPrice = price;

      const now = Date.now();
      const canAct = !persisted.pendingSince || (now - persisted.pendingSince) > ACTION_COOLDOWN_MS;

      // ---- ENTERING: wait until balance appears, never re-buy while pending ----
      if (persisted.phase === 'ENTERING') {
        status.phase = 'ENTERING';
        status.message = 'Waiting entry confirmation...';
        args.onStatus({ ...status });

        if (holdingTarget) {
          // Confirmed: only now we record the trade (avoid duplicate BUY logs
          // when balance wasn't updated yet).
          if (persisted.pendingKind === 'ENTRY') {
            const txHash = persisted.pendingTxHash || persisted.lastTxHash;
            const px = persisted.pendingPriceBasePerTarget ?? persisted.entryPrice ?? price;
            const evt: BotTradeEvent = { t: Date.now(), kind: 'ENTRY', txHash, priceBasePerTarget: px };
            args.onTrade?.(evt);
            await appendTradeLog(evt);
          }

          status.phase = 'HOLDING';
          status.message = 'Entered position (confirmed)';
          status.entryPrice = persisted.entryPrice ?? price;
          args.onStatus({ ...status });

          await writeState({
            phase: 'HOLDING',
            entryPrice: status.entryPrice,
            lastExitPrice: persisted.lastExitPrice,
            lastTxHash: persisted.lastTxHash,
            pendingSince: undefined,
            pendingKind: undefined,
            pendingTxHash: undefined,
            pendingPriceBasePerTarget: undefined,
          });
        } else if (persisted.pendingSince && (now - persisted.pendingSince) > PENDING_TIMEOUT_MS) {
          // Fail-safe: if we never see balance, return to WAIT_ENTRY (user can inspect tx hash).
          await writeState({
            phase: 'WAIT_ENTRY',
            entryPrice: undefined,
            lastExitPrice: persisted.lastExitPrice,
            lastTxHash: persisted.lastTxHash,
            pendingSince: undefined,
            pendingKind: undefined,
            pendingTxHash: undefined,
            pendingPriceBasePerTarget: undefined,
          });
        } else {
          await writeState({ ...persisted });
        }
        return;
      }

      // ---- EXITING: wait until balance disappears, never re-buy while pending ----
      if (persisted.phase === 'EXITING') {
        status.phase = 'EXITING';
        status.message = 'Waiting exit confirmation...';
        args.onStatus({ ...status });

        if (!holdingTarget) {
          // Confirmed: only now we record the EXIT (avoid duplicate SELL logs).
          if (persisted.pendingKind === 'EXIT') {
            const txHash = persisted.pendingTxHash || persisted.lastTxHash;
            const px = persisted.pendingPriceBasePerTarget ?? persisted.lastExitPrice ?? price;
            const evt: BotTradeEvent = { t: Date.now(), kind: 'EXIT', txHash, priceBasePerTarget: px };
            args.onTrade?.(evt);
            await appendTradeLog(evt);
          }

          status.phase = 'WAIT_ENTRY';
          status.message = 'Exited position (confirmed)';
          status.entryPrice = undefined;
          args.onStatus({ ...status });

          await writeState({
            phase: 'WAIT_ENTRY',
            entryPrice: undefined,
            lastExitPrice: persisted.lastExitPrice,
            lastTxHash: persisted.lastTxHash,
            pendingSince: undefined,
            pendingKind: undefined,
            pendingTxHash: undefined,
            pendingPriceBasePerTarget: undefined,
          });
        } else if (persisted.pendingSince && (now - persisted.pendingSince) > PENDING_TIMEOUT_MS) {
          // Fail-safe: if we never see balance clear, go back to HOLDING.
          await writeState({
            phase: 'HOLDING',
            entryPrice: persisted.entryPrice ?? price,
            lastExitPrice: persisted.lastExitPrice,
            lastTxHash: persisted.lastTxHash,
            pendingSince: undefined,
            pendingKind: undefined,
            pendingTxHash: undefined,
            pendingPriceBasePerTarget: undefined,
          });
        } else {
          await writeState({ ...persisted });
        }
        return;
      }

      // ---- WAIT_ENTRY: if we don't hold target, consider entry ----
      if (!holdingTarget) {
        status.phase = 'WAIT_ENTRY';
        const lastExit = persisted.lastExitPrice;
        const reentryOk = !lastExit || price <= lastExit * (1 - (args.strategy.reentryDropPct / 100));
        status.message = reentryOk ? 'Entry condition met' : 'Waiting for cheaper price';
        args.onStatus({ ...status });

        if (!reentryOk) {
          await writeState({
            phase: status.phase,
            entryPrice: persisted.entryPrice,
            lastExitPrice: persisted.lastExitPrice,
            lastTxHash: persisted.lastTxHash,
            pendingSince: persisted.pendingSince,
            pendingKind: persisted.pendingKind,
          });
          return;
        }

        if (!canAct) {
          // Cooldown guard
          status.message = 'Cooldown before entry...';
          args.onStatus({ ...status });
          return;
        }

        status.phase = 'ENTERING';
        args.onStatus({ ...status });

        const isNativeFrom = base.isNative;
        const fromAddr = base.address;
        const toAddr = args.strategy.targetTokenAddress;

        const res = await executeSwap(
          wallet,
          args.strategy.networkKey,
          fromAddr,
          toAddr,
          args.strategy.amountIn,
          isNativeFrom
        );

        status.lastTxHash = res.tx.hash;

        const entryPrice = price;
        status.entryPrice = entryPrice;
        status.message = 'Entry sent, waiting confirmation';
        args.onStatus({ ...status });

        await writeState({
          phase: 'ENTERING',
          entryPrice,
          lastExitPrice: persisted.lastExitPrice,
          lastTxHash: res.tx.hash,
          pendingSince: Date.now(),
          pendingKind: 'ENTRY',
          pendingTxHash: res.tx.hash,
          pendingPriceBasePerTarget: price,
        });
        return;
      }

      // ---- HOLDING: check TP/SL; never enter here ----
      status.phase = 'HOLDING';
      const entryPrice = persisted.entryPrice;
      if (!entryPrice) {
        // If unknown, set current as entry to avoid immediate churn.
        await writeState({
          phase: 'HOLDING',
          entryPrice: price,
          lastExitPrice: persisted.lastExitPrice,
          lastTxHash: persisted.lastTxHash,
          pendingSince: undefined,
          pendingKind: undefined,
        });
        status.entryPrice = price;
        args.onStatus({ ...status });
        return;
      }

      // Profit when target becomes MORE expensive in base terms -> price (base/target) goes UP.
      const profitPct = ((price - entryPrice) / entryPrice) * 100;
      const take = profitPct >= args.strategy.takeProfitPct;
      const stop = profitPct <= -Math.abs(args.strategy.stopLossPct);

      status.message = `P&L: ${profitPct.toFixed(2)}%`;
      args.onStatus({ ...status });

      if (!take && !stop) {
        await writeState({
          phase: 'HOLDING',
          entryPrice,
          lastExitPrice: persisted.lastExitPrice,
          lastTxHash: persisted.lastTxHash,
          pendingSince: undefined,
          pendingKind: undefined,
        });
        return;
      }

      if (!canAct) {
        status.message = 'Cooldown before exit...';
        args.onStatus({ ...status });
        return;
      }

      status.phase = 'EXITING';
      args.onStatus({ ...status });

      // Sell ALL target back to base (sell by balance)
      const amountTargetToSell = ethers.formatUnits(targetBal, targetDecimals);
      const isNativeBase = base.isNative;
      const fromAddr = args.strategy.targetTokenAddress;
      const toAddr = isNativeBase ? 'NATIVE' : base.address;

      const res = await executeSwap(wallet, args.strategy.networkKey, fromAddr, toAddr, amountTargetToSell, false);

      status.lastTxHash = res.tx.hash;

      status.lastExitPrice = price;
      status.message = take ? 'Exit sent (TP), waiting confirmation' : 'Exit sent (SL), waiting confirmation';
      args.onStatus({ ...status });

      await writeState({
        phase: 'EXITING',
        entryPrice: persisted.entryPrice,
        lastExitPrice: price,
        lastTxHash: res.tx.hash,
        pendingSince: Date.now(),
        pendingKind: 'EXIT',
        pendingTxHash: res.tx.hash,
        pendingPriceBasePerTarget: price,
      });
    } catch (e: any) {
      status.phase = 'ERROR';
      status.message = String(e?.message || e);
      args.onStatus({ ...status, running: true });
      args.onError({ message: 'Bot loop failed', details: String(e?.stack || e?.message || e) });
      await writeState({ phase: 'ERROR' });
    }
  };

  const intervalMs = Math.max(10, Number(args.strategy.pollSeconds) || 10) * 1000;
  const timer = setInterval(() => { tick(); }, intervalMs);
  // Run immediately
  tick();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      args.onStatus({ running: false, phase: 'IDLE' });
    }
  };
};

export const stopBotLoop = (h: BotLoopHandle) => {
  h.stop();
};
