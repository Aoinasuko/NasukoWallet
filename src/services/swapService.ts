import { ethers } from 'ethers';
import { UNISWAP_ADDRESSES } from '../constants';
import { DEFAULT_NETWORKS } from '../constants';

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)" // Decimals取得用に追加
];

const ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

export const executeSwap = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  networkKey: string,
  fromTokenAddress: string, // シンボルではなくアドレスを受け取る
  toTokenAddress: string,   // シンボルではなくアドレスを受け取る
  amount: string,
  isNativeFrom: boolean     // Native(ETH)からのスワップかどうかのフラグ
) => {
  const addresses = UNISWAP_ADDRESSES[networkKey];
  if (!addresses) {
    throw new Error(`Real swap not supported on ${networkKey}. Only Sepolia and Mainnet are supported.`);
  }

  const netConfig = DEFAULT_NETWORKS[networkKey];
  const provider = new ethers.JsonRpcProvider(netConfig.rpc);
  const connectedWallet = wallet.connect(provider);
  const router = new ethers.Contract(addresses.ROUTER, ROUTER_ABI, connectedWallet);

  // 1. Decimalsの解決とAmount計算
  let decimals = 18;
  if (!isNativeFrom) {
    // Native以外ならコントラクトから桁数を取得
    try {
        const tokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, connectedWallet);
        decimals = await tokenContract.decimals();
    } catch (e) {
        console.warn("Failed to fetch decimals, defaulting to 18", e);
        // USDC等の既知トークンはハードコードで救済しても良いが、基本は取得する
        if(fromTokenAddress.toLowerCase() === addresses.USDC?.toLowerCase()) decimals = 6;
    }
  }
  
  const amountIn = ethers.parseUnits(amount, decimals);

  console.log(`Preparing Swap on ${networkKey}`);
  console.log(`From: ${fromTokenAddress} (Native: ${isNativeFrom})`);
  console.log(`To: ${toTokenAddress}`);
  console.log(`Amount: ${amount} (Raw: ${amountIn}, Decimals: ${decimals})`);

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
    } else {
      console.log("Allowance sufficient.");
    }
  }

  // 3. スワップパラメータ作成
  // Nativeから送る場合は WETHのアドレスを tokenIn に設定
  const actualTokenIn = isNativeFrom ? addresses.WETH : fromTokenAddress;
  // Nativeへ送る場合(受取)は WETHのアドレスを tokenOut に設定 (Router仕様)
  // ※受取側がETH希望でもUniswap V3はWETHで出力します。Unwrapは別途必要ですが今回は省略(WETH受取)
  const isNativeTo = toTokenAddress === "NATIVE" || toTokenAddress === ethers.ZeroAddress;
  const actualTokenOut = isNativeTo ? addresses.WETH : toTokenAddress;

  const params = {
    tokenIn: actualTokenIn,
    tokenOut: actualTokenOut,
    fee: 3000, 
    recipient: wallet.address,
    amountIn: amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  console.log("Executing Swap Transaction...", params);

  const tx = await router.exactInputSingle(params, { 
    value: isNativeFrom ? amountIn : 0, 
    gasLimit: 300000 
  });

  console.log("Tx Sent:", tx.hash);
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    throw new Error("Swap Transaction Reverted (Failed)");
  }

  return tx;
};