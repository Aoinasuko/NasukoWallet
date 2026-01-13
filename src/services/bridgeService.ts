import { ethers } from 'ethers';

import { LIFI_API_BASE, LIFI_API_KEY } from '../apiConfig';

type LiFiQuoteResponse = {
  id: string;
  tool: string;
  toolDetails?: { key?: string; name?: string; logoURI?: string };
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: { address: string; symbol: string; decimals: number; chainId: number; name?: string };
    toToken: { address: string; symbol: string; decimals: number; chainId: number; name?: string };
    fromAmount: string;
    fromAddress: string;
    toAddress: string;
    slippage: number;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress?: string;
    executionDuration?: number; // seconds
    feeCosts?: Array<{ name?: string; description?: string; amount?: string; amountUSD?: string; included?: boolean }>;
    gasCosts?: Array<{ type?: string; estimate?: string; limit?: string; amount?: string; amountUSD?: string }>;
  };
  transactionRequest: {
    from: string;
    to: string;
    chainId: number;
    data: string;
    value: string;
    gasPrice?: string;
    gasLimit?: string;
  };
};

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export async function getBridgeQuote(params: {
  fromChainId: string;
  toChainId: string;
  fromTokenAddress: string; // use 0x000.. for native
  toTokenAddress: string;
  fromAmount: string; // raw units
  fromAddress: string;
  toAddress: string;
  slippage?: number; // 0.003
  integrator?: string; // optional tracking
  apiKey?: string; // optional override (通常は apiConfig.ts の LIFI_API_KEY を使用)
}) {
  const {
    fromChainId,
    toChainId,
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    fromAddress,
    toAddress,
    slippage = 0.003,
    integrator,
    apiKey,
  } = params;

  const effectiveKey = apiKey ?? (LIFI_API_KEY || undefined);
  const url = new URL(`${LIFI_API_BASE}/quote`);
  url.searchParams.set('fromChain', String(fromChainId));
  url.searchParams.set('toChain', String(toChainId));
  url.searchParams.set('fromToken', fromTokenAddress);
  url.searchParams.set('toToken', toTokenAddress);
  url.searchParams.set('fromAmount', fromAmount);
  url.searchParams.set('fromAddress', fromAddress);
  url.searchParams.set('toAddress', toAddress);
  url.searchParams.set('slippage', String(slippage));
  if (integrator) url.searchParams.set('integrator', integrator);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: effectiveKey ? { 'x-lifi-api-key': effectiveKey } : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LI.FI quote failed: ${res.status} ${res.statusText} ${text}`.trim());
  }
  const data = (await res.json()) as LiFiQuoteResponse;
  if (!data?.transactionRequest?.to || !data?.estimate?.toAmountMin) {
    throw new Error('LI.FI quote response missing transactionRequest/estimate');
  }
  return data;
}

export async function executeBridge(params: {
  wallet: ethers.Wallet | ethers.HDNodeWallet;
  rpcUrl: string;
  quote: LiFiQuoteResponse;
  fromTokenIsNative: boolean;
}) {
  const { wallet, rpcUrl, quote, fromTokenIsNative } = params;

  // IMPORTANT: for allowance/static calls we need a Signer that has a Provider.
  // Ethers v6 will throw "missing provider" if a contract call is made with a signer
  // that is not connected to a provider.
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const connectedWallet = wallet.connect(provider);

  // If ERC20, approve if needed
  const approvalAddress = quote.estimate.approvalAddress;
  if (!fromTokenIsNative && approvalAddress) {
    const tokenAddr = quote.action.fromToken.address;
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, connectedWallet);
    const owner = await connectedWallet.getAddress();
    const allowance: bigint = await token.allowance(owner, approvalAddress);
    const needed = BigInt(quote.action.fromAmount);
    if (allowance < needed) {
      const txApprove = await token.approve(approvalAddress, needed);
      await txApprove.wait();
    }
  }

  const txReq: ethers.TransactionRequest = {
    from: quote.transactionRequest.from,
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: quote.transactionRequest.value,
    chainId: quote.transactionRequest.chainId,
  };

  // Some responses provide gas fields as hex strings; ethers accepts them.
  if (quote.transactionRequest.gasLimit) txReq.gasLimit = quote.transactionRequest.gasLimit;
  if (quote.transactionRequest.gasPrice) txReq.gasPrice = quote.transactionRequest.gasPrice;

  const tx = await connectedWallet.sendTransaction(txReq);

  // NOTE:
  // ブリッジは「送信Txが採掘された」後も、最終着金まで数分〜十数分かかることがあります。
  // ここで tx.wait() を待つと UI が「処理中…」のまま止まって見えるため、
  // 送信Txのハッシュを返して履歴画面で /status をポーリングして進捗を追跡します。

  return { tx };
}