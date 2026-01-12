import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { DEFAULT_NETWORKS } from '../constants';

const ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
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

  // ★修正: 出力トークンのアドレス解決
  let tokenOutAddress = '';
  if (toTokenSymbol === 'USDC') {
    tokenOutAddress = addresses.USDC;
  } else if (toTokenSymbol === 'MATIC' || toTokenSymbol === 'POL') {
    // MATIC対応 (アドレスがない場合はエラー)
    if (!addresses.MATIC) throw new Error(`MATIC not supported on ${networkKey}`);
    tokenOutAddress = addresses.MATIC;
  } else {
    throw new Error(`Target token ${toTokenSymbol} not supported for real swap.`);
  }

  // Connect Wallet
  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);

  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  const amountIn = ethers.parseEther(amount);
  
  // ★重要: 期限設定
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

  const params = {
    tokenIn: addresses.WETH,
    tokenOut: tokenOutAddress,
    fee: 3000, // 0.3% pool
    recipient: wallet.address,
    deadline: deadline, // Deadline追加
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  console.log("Executing Real Swap...", params);

  // ★重要: ガスリミット手動設定
  const tx = await router.exactInputSingle(params, { 
    value: amountIn,
    gasLimit: 300000 
  });

  // ★重要: 完了待ち
  console.log("Tx Sent:", tx.hash);
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    throw new Error("Swap Transaction Reverted (Failed)");
  }

  return tx;
};