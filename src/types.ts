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
  type: 'send' | 'receive' | 'swap';
  amount: string;
  symbol: string;
  from: string;
  to: string;
  date: string;
  network: string;
  // ★追加: P/L計算用
  swapRateToMain?: number; // Swap時のメイン通貨換算レート (1 Token = X MainCurrency)
  priceInMain?: number;    // Swap時のメイン通貨換算価格 (Total Value in MainCurrency)
  priceInUsd?: number;     // Swap時のUSD価格
  priceInJpy?: number;     // Swap時のJPY価格
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
  type: 'send' | 'receive' | 'swap';
  amount: string;
  symbol: string;
  from: string;
  to: string;
  date: string;
  network: string;
};
