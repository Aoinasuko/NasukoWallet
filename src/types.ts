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
  // ★修正: キーを自由に設定できるように変更
  historyCache?: Record<string, HistoryCacheData>; 
};