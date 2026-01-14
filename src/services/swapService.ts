// src/services/swapService.ts

import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { resolveBestUsdcAddress } from './usdcSelector';
import { DEFAULT_NETWORKS } from '../constants';
import { getBridgeQuote, executeBridge } from './bridgeService';

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

const ROUTER_ABI = [
  // Uniswap V3 SwapRouter02 (and SwapRouter) exactInputSingle
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

const FEE_TIERS = [500, 3000, 10000];

type SwapQuote = {
  bestFee: number;
  amountOutRaw: bigint;
  tokenIn: string;
  tokenOut: string;
  /** If true, the quote is from LI.FI (same-chain route) rather than Uniswap V3. */
  isLifi?: boolean;
  /** LI.FI quote id (for status tracking etc.). */
  lifiQuoteId?: string;
};

/**
 * Get a swap quote by scanning common Uniswap V3 fee tiers with a static call.
 * Note: This is an estimate; actual received amount is read from tx logs in executeSwap.
 */
export const getSwapQuote = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  networkKey: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  isNativeFrom: boolean
): Promise<SwapQuote> => {
  const addresses = UNISWAP_ADDRESSES[networkKey];
  if (!addresses) {
    throw new Error(`Real swap not supported on ${networkKey}.`);
  }

  // Resolve best USDC representation on chains that have multiple variants (e.g., Polygon USDC vs USDC.e)
  const anyAddr: any = addresses as any;
  const usdcCandidates = new Set<string>(
    [addresses.USDC, anyAddr.USDC_NATIVE, anyAddr.USDC_E]
      .filter(Boolean)
      .map((x: string) => x.toLowerCase())
  );
  const bestUsdc = await resolveBestUsdcAddress(networkKey);
  if (bestUsdc) {
    if (usdcCandidates.has(fromTokenAddress.toLowerCase())) fromTokenAddress = bestUsdc;
    if (usdcCandidates.has(toTokenAddress.toLowerCase())) toTokenAddress = bestUsdc;
  }

  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);

  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  // tokenIn/out (native is handled as WETH)
  const actualTokenIn = isNativeFrom ? addresses.WETH : fromTokenAddress;
  const isNativeTo = toTokenAddress === "NATIVE" || toTokenAddress === ethers.ZeroAddress;
  const actualTokenOut = isNativeTo ? addresses.WETH : toTokenAddress;

  // decimals
  const fromDecimals = isNativeFrom ? 18 : await (new ethers.Contract(fromTokenAddress, ERC20_ABI, provider)).decimals();
  const amountIn = ethers.parseUnits(amount, fromDecimals);

  const paramsBase = {
    tokenIn: actualTokenIn,
    tokenOut: actualTokenOut,
    fee: 3000,
    recipient: wallet.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  let bestFee = 3000;
  let maxOut = BigInt(0);
  let feeFound = false;

  for (const fee of FEE_TIERS) {
    const tryParams = { ...paramsBase, fee };
    try {
      const out = await router.exactInputSingle.staticCall(tryParams, {
        value: isNativeFrom ? amountIn : 0
      });
      if (out > maxOut) {
        maxOut = out;
        bestFee = fee;
        feeFound = true;
      }
    } catch {
      // ignore pools that don't exist / revert
    }
  }

  if (!feeFound) {
    // Fallback: LI.FI same-chain route (aggregator). This makes the bot robust when Uniswap V3 has no pool
    // for the requested pair (e.g., WMATIC <-> Native USDC on Polygon).
    const netConfig = DEFAULT_NETWORKS[networkKey];
    const chainId = netConfig?.chainId;
    if (!chainId) {
      throw new Error("有効な流動性プールが見つかりませんでした。");
    }

    // LI.FI represents native token as 0x000...000. Our UI may pass "NATIVE" or ZeroAddress.
    const toIsNative = toTokenAddress === "NATIVE" || toTokenAddress === ethers.ZeroAddress;
    const fromTokenForLifi = isNativeFrom ? ethers.ZeroAddress : fromTokenAddress;
    const toTokenForLifi = toIsNative ? ethers.ZeroAddress : toTokenAddress;

    // amount already parsed to raw units above.
    const lifi = await getBridgeQuote({
      fromChainId: String(chainId),
      toChainId: String(chainId),
      fromTokenAddress: fromTokenForLifi,
      toTokenAddress: toTokenForLifi,
      fromAmount: amountIn.toString(),
      fromAddress: wallet.address,
      toAddress: wallet.address,
      slippage: 0.003,
      integrator: 'wallet-ext-autotrade',
    });
    const outMin = BigInt(lifi.estimate.toAmountMin);
    return {
      bestFee: -1,
      amountOutRaw: outMin,
      tokenIn: actualTokenIn,
      tokenOut: actualTokenOut,
      isLifi: true,
      lifiQuoteId: lifi.id,
    };
  }

  return { bestFee, amountOutRaw: maxOut, tokenIn: actualTokenIn, tokenOut: actualTokenOut };
};



export const executeSwap = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  networkKey: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  isNativeFrom: boolean
) => {
  const addresses = UNISWAP_ADDRESSES[networkKey];
  if (!addresses) {
    throw new Error(`Real swap not supported on ${networkKey}.`);
  }

  // Resolve best USDC representation on chains that have multiple variants (e.g., Polygon USDC vs USDC.e)
  const anyAddr: any = addresses as any;
  const usdcCandidates = new Set<string>(
    [addresses.USDC, anyAddr.USDC_NATIVE, anyAddr.USDC_E]
      .filter(Boolean)
      .map((x: string) => x.toLowerCase())
  );
  const bestUsdc = await resolveBestUsdcAddress(networkKey);
  if (bestUsdc) {
    if (usdcCandidates.has(fromTokenAddress.toLowerCase())) fromTokenAddress = bestUsdc;
    if (usdcCandidates.has(toTokenAddress.toLowerCase())) toTokenAddress = bestUsdc;
  }

  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);
  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  // 1. Decimalsの解決
  let decimals = 18;
  if (!isNativeFrom) {
    try {
        const tokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, connectedWallet);
        decimals = await tokenContract.decimals();
    } catch (e) {
        console.warn("Failed to fetch decimals, defaulting to 18", e);
        if(fromTokenAddress.toLowerCase() === addresses.USDC?.toLowerCase()) decimals = 6;
    }
  }

  const amountIn = ethers.parseUnits(amount, decimals);
  console.log(`Preparing Swap on ${networkKey}: ${amount} (raw: ${amountIn})`);

  // 2. Approve
  if (!isNativeFrom) {
    const tokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, connectedWallet);
    const currentAllowance = await tokenContract.allowance(wallet.address, addresses.ROUTER);
    if (currentAllowance < amountIn) {
      console.log("Approving Token...");
      const txApprove = await tokenContract.approve(addresses.ROUTER, ethers.MaxUint256);
      await txApprove.wait();
      console.log("Approve Confirmed.");
    }
  }

  // 3. パラメータ準備
  const actualTokenIn = isNativeFrom ? addresses.WETH : fromTokenAddress;
  const isNativeTo = toTokenAddress === "NATIVE" || toTokenAddress === ethers.ZeroAddress;
  const actualTokenOut = isNativeTo ? addresses.WETH : toTokenAddress;

  const paramsBase = {
    tokenIn: actualTokenIn,
    tokenOut: actualTokenOut,
    fee: 3000,
    recipient: wallet.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  // 4. クォート取得 (Uniswap V3 fee tier scan; fallback to LI.FI same-chain)
  const quote = await getSwapQuote(wallet, networkKey, fromTokenAddress, toTokenAddress, amount, isNativeFrom);
  const bestFee = quote.bestFee;
  const maxOut = quote.amountOutRaw;

  // If Uniswap V3 has no pool, use LI.FI route to execute the swap.
  if (quote.isLifi || bestFee < 0) {
    const chainId = netConfig.chainId;
    if (!chainId) throw new Error('LI.FI swap requires chainId');

    const fromTokenForLifi = isNativeFrom ? ethers.ZeroAddress : fromTokenAddress;
    const toTokenForLifi = isNativeTo ? ethers.ZeroAddress : toTokenAddress;

    const lifiQuote = await getBridgeQuote({
      fromChainId: String(chainId),
      toChainId: String(chainId),
      fromTokenAddress: fromTokenForLifi,
      toTokenAddress: toTokenForLifi,
      fromAmount: amountIn.toString(),
      fromAddress: wallet.address,
      toAddress: wallet.address,
      slippage: 0.003,
      integrator: 'wallet-ext-autotrade',
    });

    const { tx } = await executeBridge({
      wallet,
      rpcUrl: netConfig.rpc,
      quote: lifiQuote,
      fromTokenIsNative: isNativeFrom,
    });

    const outMin = BigInt(lifiQuote.estimate.toAmountMin);
    return { tx, amountOutRaw: outMin, quoteOutRaw: outMin };
  }

  console.log(`Selected Best Fee: ${bestFee}, Est Out: ${maxOut}`);
  paramsBase.fee = bestFee;

// 5. 実行
  console.log("Executing Swap Transaction...");
  const tx = await router.exactInputSingle(paramsBase, { 
    value: isNativeFrom ? amountIn : 0, 
    gasLimit: 500000 
  });

  console.log("Tx Sent:", tx.hash);
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    throw new Error("Swap Transaction Reverted");
  }

  
  // 6. 実際の受取額をログから推定
  // Uniswap V3 Router 自体は amountOut を返しますが、Ethers v6 では返り値がトランザクション完了後に得づらいので、
  // tokenOut の Transfer(to=recipient) を拾って実受取額として扱います。
  let actualOutRaw = BigInt(0);
  try {
    const transferIface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ]);

    for (const log of receipt.logs || []) {
      if (!log || !log.address) continue;
      if (log.address.toLowerCase() !== actualTokenOut.toLowerCase()) continue;

      try {
        const parsed = transferIface.parseLog({ topics: log.topics as any, data: log.data as any });
        if (parsed?.name === "Transfer") {
          const toAddr = String(parsed.args.to).toLowerCase();
          if (toAddr === wallet.address.toLowerCase()) {
            actualOutRaw += BigInt(parsed.args.value.toString());
          }
        }
      } catch {
        // ignore non-Transfer logs
      }
    }
  } catch {
    // ignore parse issues
  }

  // フォールバック: Transfer が拾えない場合はクォート値を使う
  if (actualOutRaw === BigInt(0)) {
    actualOutRaw = maxOut;
  }

  return { tx, amountOutRaw: actualOutRaw, quoteOutRaw: maxOut };
};