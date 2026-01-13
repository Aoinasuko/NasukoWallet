import type { TxHistory } from '../types';

import { LIFI_API_BASE, LIFI_API_KEY } from '../apiConfig';

/**
 * LI.FI status endpoint wrapper.
 * Docs: https://docs.li.fi/api-reference/check-the-status-of-a-cross-chain-transfer
 */
export type LiFiStatusResponse = {
  transactionId?: string;
  status?: string;
  substatus?: string;
  substatusMessage?: string;
  tool?: string;
  lifiExplorerLink?: string;
  bridgeExplorerLink?: string;
  sending?: {
    txHash?: string;
    txLink?: string;
    timestamp?: number;
    amount?: string;
    amountUSD?: string;
  };
  receiving?: {
    txHash?: string;
    txLink?: string;
    timestamp?: number;
    amount?: string;
    amountUSD?: string;
  };
  feeCosts?: Array<{ name?: string; amountUSD?: string; included?: boolean }>;
};

export async function getBridgeStatus(params: {
  txHashOrId: string; // sending hash OR receiving hash OR transactionId/step id
  fromChain?: string; // chain id or key
  toChain?: string;   // chain id or key
  bridgeTool?: string;
  apiKey?: string; // optional override (通常は apiConfig.ts の LIFI_API_KEY を使用)
}): Promise<LiFiStatusResponse> {
  const { txHashOrId, fromChain, toChain, bridgeTool, apiKey } = params;

  // Guard against accidental non-txHash values (e.g. explorer links).
  // LI.FI expects a 0x-prefixed 32-byte hash for EVM transactions.
  const looksLikeEvmTxHash = /^0x[0-9a-fA-F]{64}$/.test(txHashOrId);

  const effectiveKey = apiKey ?? (LIFI_API_KEY || undefined);
  const url = new URL(`${LIFI_API_BASE}/status`);
  url.searchParams.set('txHash', txHashOrId);
  if (fromChain) url.searchParams.set('fromChain', String(fromChain));
  if (toChain) url.searchParams.set('toChain', String(toChain));
  if (bridgeTool) url.searchParams.set('bridge', bridgeTool);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: effectiveKey ? { 'x-lifi-api-key': effectiveKey } : undefined,
  });

  if (!res.ok) {
    // LI.FI FAQ: "Not an EVM Transaction" may appear until the tx is indexed.
    // Treat it as a non-fatal, temporary PENDING state.
    // https://docs.li.fi/guides/troubleshooting/faq
    const text = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(text || '{}') as { message?: string; code?: number | string };
      const msg = String(parsed?.message || '');
      const codeNum = parsed?.code == null ? NaN : Number(parsed.code);
      if (res.status === 400 && codeNum === 1011 && msg.toLowerCase().includes('not an evm transaction')) {
        return {
          status: 'PENDING',
          substatus: looksLikeEvmTxHash ? 'NOT_INDEXED' : 'INVALID_TXHASH',
          substatusMessage: msg,
        };
      }
    } catch {
      // fallthrough
    }
    throw new Error(`LI.FI status failed: ${res.status} ${res.statusText} ${text}`.trim());
  }

  return (await res.json()) as LiFiStatusResponse;
}

/**
 * Convert a status response to partial TxHistory updates.
 */
export function statusToHistoryPatch(status: LiFiStatusResponse): Partial<TxHistory> {
  return {
    lifiTransactionId: status.transactionId,
    bridgeStatus: status.status,
    bridgeSubstatus: status.substatus,
    bridgeSubstatusMessage: status.substatusMessage,
    bridgeTool: status.tool,
    sendingTxLink: status.sending?.txLink,
    receivingTxHash: status.receiving?.txHash,
    receivingTxLink: status.receiving?.txLink,
    lifiExplorerLink: status.lifiExplorerLink,
    bridgeExplorerLink: status.bridgeExplorerLink,
  };
}
