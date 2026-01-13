// src/apiConfig.ts
//
// 各種外部API（LI.FI / Alchemy など）の設定を一箇所にまとめます。
// 設定画面ではなく「ソースコードで管理したい」場合はこのファイルを編集してください。

/**
 * LI.FI API
 * - Base URL は通常 `https://li.quest/v1`
 * - API Key は任意（レート制限緩和用）
 *   ※公開配布する場合はフロントに直書きせず、サーバープロキシ経由にするのが安全です。
 */
export const LIFI_API_BASE = 'https://li.quest/v1';
export const LIFI_API_KEY = 'XXXXX'; // 例: 'xxxxxxxxxxxxxxxx'

/**
 * Alchemy
 *
 * - あなたの Alchemy API Key をここに入れてください。
 * - Alchemy 対応チェーンは、このキーから RPC URL を自動生成して利用します。
 */
export const ALCHEMY_API_KEY = 'YYYYY';

/**
 * Alchemy RPC のネットワーク識別子
 * ここに存在する networkKey は「Alchemy RPC を優先」します。
 */
const ALCHEMY_RPC_SLUG: Record<string, string> = {
  mainnet: 'eth-mainnet',
  sepolia: 'eth-sepolia',
  polygon: 'polygon-mainnet',
  optimism: 'opt-mainnet',
  arbitrum: 'arb-mainnet',
  base: 'base-mainnet',
};

/**
 * 指定 networkKey の RPC URL を返します。
 * - ALCHEMY_API_KEY が設定されていて、かつ ALCHEMY_RPC_SLUG に存在する場合は Alchemy RPC を返す
 * - それ以外は fallback を返す
 */
export const getRpcUrl = (networkKey: string, fallback: string): string => {
  const slug = ALCHEMY_RPC_SLUG[networkKey];
  if (ALCHEMY_API_KEY && slug) return `https://${slug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
  return fallback;
};
