// src/services/swapService.ts

import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { DEFAULT_NETWORKS } from '../constants';

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

// SwapRouter02 ABI (deadlineなし)
const ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

// Fee Tiers to try: 0.05%, 0.3%, 1%
const FEE_TIERS = [500, 3000, 10000];

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

  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);
  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  // 1. Decimalsの解決とAmount計算
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

  // 2. Approve処理 (Native以外の場合)
  if (!isNativeFrom) {
    console.log("Checking Allowance...");
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

  // 基本パラメータ
  const paramsBase = {
    tokenIn: actualTokenIn,
    tokenOut: actualTokenOut,
    fee: 3000, // 初期値（後で上書き）
    recipient: wallet.address,
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  // 4. 最適なPool(Fee Tier)をスキャン
  // staticCallを使ってシミュレーションし、成功する最もアウトプットが多いFeeを探す
  let bestFee = 3000;
  let maxOut = BigInt(0);
  let feeFound = false;

  console.log("Scanning liquidity pools...");
  for (const fee of FEE_TIERS) {
      const tryParams = { ...paramsBase, fee };
      try {
          // staticCall: トランザクションを投げずに結果をシミュレーション
          // Nativeの場合は value を設定してコール
          const out = await router.exactInputSingle.staticCall(tryParams, {
             value: isNativeFrom ? amountIn : 0
          });
          console.log(`Fee ${fee} -> Out: ${out}`);

          if (out > maxOut) {
              maxOut = out;
              bestFee = fee;
              feeFound = true;
          }
      } catch (e) {
          // console.warn(`Fee ${fee} failed or no liquidity.`);
      }
  }

  if (!feeFound) {
      throw new Error("有効な流動性プールが見つかりませんでした (Try: 0.05%, 0.3%, 1%)。ペアが存在しない可能性があります。");
  }

  console.log(`Selected Best Fee: ${bestFee}`);
  paramsBase.fee = bestFee;

  // 5. 実行
  console.log("Executing Swap Transaction...");
  const tx = await router.exactInputSingle(paramsBase, { 
    value: isNativeFrom ? amountIn : 0, 
    gasLimit: 500000 // ガスリミットを少し余裕を持たせる
  });

  console.log("Tx Sent:", tx.hash);
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    throw new Error("Swap Transaction Reverted (On-chain failure)");
  }

  return tx;
};