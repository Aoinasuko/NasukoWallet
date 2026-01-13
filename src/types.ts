export type NetworkConfig = {
  name: string;
  rpc: string;
  chainId: string;
  symbol: string;
  coingeckoId: string;
  explorer: string;
  color?: string; 
  logo: string;
  isCustom?: boolean;
};

export type SavedAccount = {
  name: string;
  address: string;
  encryptedJson: string;
  encryptedPassword: string;
};

export type VaultData = {
  totpSecret: string;
  isSetupComplete: boolean;
};

export type StorageSession = {
  masterPass?: string;
};

export type TxHistory = {
  id: string;
  hash: string;
  type: 'send' | 'receive' | 'swap' | 'bridge';
  amount: string;
  symbol: string;
  from: string;
  to: string;
  date: string;
  network: string;
  // Bridge用: 送信元/送信先ネットワーク
  toNetwork?: string;
  fromNetworkKey?: string;
  toNetworkKey?: string;
  fromChainId?: string;
  toChainId?: string;
  bridgeTool?: string;
  bridgeTxHashOnDest?: string;
  receivedAmount?: string;
  exchangeRate?: number;
  priceInUsd?: number;
  priceInJpy?: number;
  // ★改善: どのトークン単価を履歴として保存したか（損益計算の基準）
  priceBasis?: 'from' | 'to';
  priceBasisSymbol?: string;
  // 互換/詳細: 両側単価を保存しておく
  priceInUsdFrom?: number;
  priceInUsdTo?: number;
  // ★改善: 実行前クォート(見積)の受取数量（UI上の推定損益に利用）
  quotedReceivedAmount?: string;
  // ★Bridge status tracking (LI.FI /status)
  lifiStepId?: string;
  lifiTransactionId?: string;
  bridgeStatus?: 'NOT_FOUND' | 'INVALID' | 'PENDING' | 'DONE' | 'FAILED' | string;
  bridgeSubstatus?: string;
  bridgeSubstatusMessage?: string;
  sendingTxLink?: string;
  receivingTxHash?: string;
  receivingTxLink?: string;
  lifiExplorerLink?: string;
  bridgeExplorerLink?: string;
  // 見積ベースの情報（確認画面表示用）
  estimatedDurationSeconds?: number;
  estimatedFeeUsd?: number;
  estimatedGasUsd?: number;
};

export type PriceCacheData = {
  price: number;
  timestamp: number;
};

export type HistoryCacheData = {
  lastUpdated: number;
  data: TxHistory[];
};

export type StorageLocal = {
  vault?: string;
  accounts?: SavedAccount[];
  network?: string;
  bgImage?: string;
  history?: TxHistory[]; 
  customNetworks?: Record<string, NetworkConfig>;
  historyCache?: Record<string, HistoryCacheData>; 
  mainNetwork?: string;
  // ★追加: 価格キャッシュ保存用
  priceCache?: Record<string, PriceCacheData>;
};

export type MarketData = {
  price: number;
  change: number;
};

export type TokenData = {
  name: string;
  symbol: string;
  balance: string;
  logo: string;
  address: string;
  market?: {
    jpy: MarketData;
    usd: MarketData;
  };
};

export type NftData = {
  name: string;
  tokenId: string;
  image: string;
  collectionName: string;
};

export type AlchemyHistory = {
  id: string;
  hash: string;
  type: 'send' | 'receive' | 'swap' | 'bridge';
  amount: string;
  symbol: string;
  from: string;
  to: string;
  date: string;
  network: string;
  // Bridge用: 送信元/送信先ネットワーク
  toNetwork?: string;
  fromNetworkKey?: string;
  toNetworkKey?: string;
  fromChainId?: string;
  toChainId?: string;
  bridgeTool?: string;
  bridgeTxHashOnDest?: string;
  receivedAmount?: string; 
};