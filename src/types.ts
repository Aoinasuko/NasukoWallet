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
  amount: string;     // 送信額 (Input Amount)
  symbol: string;     // 表示用 "ETH > USDC"
  from: string;
  to: string;
  date: string;
  network: string;
  // ★追加: P/L計算用フィールド
  receivedAmount?: string; // 受取額 (Output Amount)
  exchangeRate?: number;   // レート (1 InputToken = ? OutputToken)
  priceInUsd?: number;     // 取引時点のUSD単価
  priceInJpy?: number;     // 取引時点のJPY単価
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
  mainNetwork?: string; // ★追加: メイン通貨設定保存用
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