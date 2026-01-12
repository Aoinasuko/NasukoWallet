import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { DEFAULT_NETWORKS } from '../constants';

// ★修正: SwapRouter02用のABI (deadlineがないバージョン)
const ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

export const executeSwap = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  networkKey: string,
  fromTokenSymbol: string,
  toTokenSymbol: string,
  amount: string
) => {
  const addresses = UNISWAP_ADDRESSES[networkKey];
  if (!addresses) {
    throw new Error(`Real swap not supported on ${networkKey}. Only Sepolia and Mainnet are supported.`);
  }

  const isNativeFrom = fromTokenSymbol.includes('ETH') || fromTokenSymbol === 'SepoliaETH';
  if (!isNativeFrom) throw new Error("Only Native ETH swaps are supported in this version.");

  let tokenOutAddress = '';
  if (toTokenSymbol === 'USDC') {
    tokenOutAddress = addresses.USDC;
  } else if (toTokenSymbol === 'MATIC' || toTokenSymbol === 'POL') {
    if (!addresses.MATIC) throw new Error(`MATIC not supported on ${networkKey}`);
    tokenOutAddress = addresses.MATIC;
  } else {
    throw new Error(`Target token ${toTokenSymbol} not supported for real swap.`);
  }

  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);
  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);
  const amountIn = ethers.parseEther(amount);

  // ★修正: パラメータから deadline を削除
  // (SwapRouter02のexactInputSingle構造体にはdeadlineが含まれません)
  const params = {
    tokenIn: addresses.WETH,
    tokenOut: tokenOutAddress,
    fee: 3000, // ★注意: 失敗する場合は 500 (0.05%) や 10000 (1%) も試してください
    recipient: wallet.address,
    // deadline: deadline, // ←削除
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  console.log("Executing Real Swap on Sepolia...", params);

  const tx = await router.exactInputSingle(params, { 
    value: amountIn,
    gasLimit: 300000 
  });

  console.log("Tx Sent:", tx.hash);
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    throw new Error("Swap Transaction Reverted (Failed)");
  }

  return tx;
};