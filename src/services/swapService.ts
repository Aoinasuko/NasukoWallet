import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { DEFAULT_NETWORKS } from '../constants';

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
  // Check support
  const addresses = UNISWAP_ADDRESSES[networkKey];
  if (!addresses) {
    throw new Error(`Real swap not supported on ${networkKey}. Only Sepolia and Mainnet are supported.`);
  }

  // Determine standard symbols (handle "SepoliaETH" vs "ETH")
  const isNativeFrom = fromTokenSymbol.includes('ETH') || fromTokenSymbol === 'SepoliaETH';

  if (!isNativeFrom) {
     throw new Error("Only Native ETH swaps are supported in this version.");
  }

  // Resolve ToToken
  // We only support USDC for now in the map
  let tokenOutAddress = '';
  if (toTokenSymbol === 'USDC') {
    tokenOutAddress = addresses.USDC;
  } else {
    throw new Error(`Target token ${toTokenSymbol} not supported for real swap.`);
  }

  // Connect Wallet
  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);

  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  const amountIn = ethers.parseEther(amount);

  const params = {
    tokenIn: addresses.WETH,
    tokenOut: tokenOutAddress,
    fee: 3000, // 0.3%
    recipient: wallet.address,
    amountIn: amountIn,
    amountOutMinimum: 0, // No slippage protection for easy testing
    sqrtPriceLimitX96: 0
  };

  console.log("Executing Real Swap...", params);

  // Call exactInputSingle with value (since it's Native -> Token, Router02 wraps it)
  // Note: SwapRouter02 wraps ETH if msg.value > 0 and tokenIn == WETH9
  const tx = await router.exactInputSingle(params, { value: amountIn });

  return tx;
};
