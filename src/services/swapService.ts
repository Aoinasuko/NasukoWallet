import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { DEFAULT_NETWORKS } from '../constants';

// ★修正: deadlineを含む正しいABI
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
  if (!addresses) throw new Error(`Swap not supported on ${networkKey}`);

  const isNativeFrom = fromTokenSymbol.includes('ETH') || fromTokenSymbol === 'SepoliaETH';
  if (!isNativeFrom) throw new Error("Only Native ETH swaps are supported.");

  let tokenOutAddress = '';
  if (toTokenSymbol === 'USDC') tokenOutAddress = addresses.USDC;
  else throw new Error(`Target token ${toTokenSymbol} not supported.`);

  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);
  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  const amountIn = ethers.parseEther(amount);
  
  // ★重要: 有効期限 (現在時刻 + 20分)
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

  const params = {
    tokenIn: addresses.WETH,
    tokenOut: tokenOutAddress,
    fee: 3000, // 0.3%
    recipient: wallet.address,
    deadline: deadline, // ★追加
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  console.log("Swapping...", params);

  // ガスリミットを高めに設定
  const tx = await router.exactInputSingle(params, { 
    value: amountIn,
    gasLimit: 300000 
  });

  console.log("Tx Sent:", tx.hash);

  // ★重要: トランザクションの完了を待つ！
  // これをしないと「成功しました」と言いつつ裏で失敗することがあります
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    throw new Error("Swap Transaction Reverted (Failed)");
  }

  return tx;
};