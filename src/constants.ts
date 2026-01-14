// src/constants.ts

import type { NetworkConfig } from './types';
import { getRpcUrl } from './apiConfig';

// ... (DEFAULT_NETWORKS は変更なし)
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: { 
    name: "Ethereum", rpc: getRpcUrl("mainnet", "https://cloudflare-eth.com"), chainId: "1", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://etherscan.io/tx/", color: "#627EEA",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eth.png"
  },
  polygon: { 
    name: "Polygon", rpc: getRpcUrl("polygon", "https://polygon-rpc.com"), chainId: "137", symbol: "POL", coingeckoId: "polygon-ecosystem-token", 
    explorer: "https://polygonscan.com/tx/", color: "#8247E5",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/matic.png"
  },
  bsc: { 
    name: "BNB Chain", rpc: getRpcUrl("bsc", "https://bsc-dataseed.binance.org"), chainId: "56", symbol: "BNB", coingeckoId: "binancecoin", 
    explorer: "https://bscscan.com/tx/", color: "#F3BA2F",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bnb.png"
  },
  avalanche: { 
    name: "Avalanche", rpc: getRpcUrl("avalanche", "https://api.avax.network/ext/bc/C/rpc"), chainId: "43114", symbol: "AVAX", coingeckoId: "avalanche-2", 
    explorer: "https://snowtrace.io/tx/", color: "#E84142",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/avax.png"
  },
  optimism: { 
    name: "Optimism", rpc: getRpcUrl("optimism", "https://mainnet.optimism.io"), chainId: "10", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://optimistic.etherscan.io/tx/", color: "#FF0420",
    logo: "https://assets.coingecko.com/coins/images/25244/standard/Optimism.png"
  },
  arbitrum: { 
    name: "Arbitrum", rpc: getRpcUrl("arbitrum", "https://arb1.arbitrum.io/rpc"), chainId: "42161", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://arbiscan.io/tx/", color: "#2D374B",
    logo: "https://assets.coingecko.com/coins/images/16547/standard/arbitrum.jpg"
  },
  base: { 
    name: "Base", rpc: getRpcUrl("base", "https://mainnet.base.org"), chainId: "8453", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://basescan.org/tx/", color: "#0052FF",
    logo: "https://assets.coingecko.com/coins/images/31199/standard/base.png"
  },
  astar: { 
    name: "Astar", rpc: getRpcUrl("astar", "https://rpc.astar.network:8545"), chainId: "592", symbol: "ASTR", coingeckoId: "astar", 
    explorer: "https://astar.subscan.io/extrinsic/", color: "#1b6dc1",
    logo: "https://assets.coingecko.com/coins/images/23567/standard/astar.png"
  },
  sepolia: { 
    name: "Sepolia", rpc: getRpcUrl("sepolia", "https://rpc.sepolia.org"), chainId: "11155111", symbol: "SepoliaETH", coingeckoId: "ethereum", 
    explorer: "https://sepolia.etherscan.io/tx/", color: "#00d0ff",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/icon/eth.png"
  },
};

export const DEX_URLS: Record<string, string> = {
  mainnet: "https://app.uniswap.org/", polygon: "https://quickswap.exchange/", bsc: "https://pancakeswap.finance/", 
  avalanche: "https://traderjoexyz.com/", optimism: "https://app.uniswap.org/", arbitrum: "https://app.uniswap.org/",
  base: "https://app.uniswap.org/", astar: "https://app.arthswap.org/", sepolia: "https://app.uniswap.org/",
};

// ★修正: SwapRouter02アドレス (0x68b3...) を使用。旧Router (0xE592...) はDeadline必須のため現行ABIと不整合だった。
export const UNISWAP_ADDRESSES: Record<string, { ROUTER: string; WETH: string; USDC: string; USDC_NATIVE?: string; USDC_E?: string; MATIC?: string; POL?: string }> = {
  sepolia: {
    ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", 
    WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", 
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", 
  },
  mainnet: {
    // Router02 (No deadline in struct)
    ROUTER: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", 
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 
    MATIC: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", // Old MATIC
    POL: "0x455e53CBB86018Ac83880C351181737001F9392c", // New POL
  },
  polygon: {
    ROUTER: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    // NOTE: In this codebase, WETH is used as "wrapped native".
    // Polygon wrapped-native is WMATIC/WPOL.
    WETH: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    USDC_NATIVE: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDC_E: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    // Default USDC (will be resolved dynamically for best liquidity)
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    MATIC: "0x0000000000000000000000000000000000001010", // Native Token System Contract
  },
  optimism: {
    ROUTER: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    WETH: "0x4200000000000000000000000000000000000006",
    // Optimism USDC (native)
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  // 他チェーンも Router02 は 0x68b3... が一般的
};

// ★修正: CoinGecko ID を追加
export const MAJOR_TOKENS_LIST: Record<string, { symbol: string; address: string; name: string; coingeckoId?: string }[]> = {
  mainnet: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', name: 'USD Coin', coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', name: 'Tether USD', coingeckoId: 'tether' },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', name: 'Dai Stablecoin', coingeckoId: 'dai' },
    { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', name: 'Wrapped BTC', coingeckoId: 'wrapped-bitcoin' },
    { symbol: 'POL', address: '0x455e53CBB86018Ac83880C351181737001F9392c', name: 'Polygon Ecosystem Token', coingeckoId: 'polygon-ecosystem-token' },
    { symbol: 'MATIC', address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', name: 'Polygon (Old)', coingeckoId: 'matic-network' },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', name: 'Uniswap', coingeckoId: 'uniswap' },
    { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', name: 'Chainlink', coingeckoId: 'chainlink' },
    { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', name: 'Aave', coingeckoId: 'aave' },
    { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', name: 'Pepe', coingeckoId: 'pepe' },
    { symbol: 'SHIB', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', name: 'Shiba Inu', coingeckoId: 'shiba-inu' },
  ],
  polygon: [
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', name: 'USD Coin (Native)', coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', name: 'Tether USD', coingeckoId: 'tether' },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', name: 'Wrapped Ether', coingeckoId: 'ethereum' },
    { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', name: 'Wrapped BTC', coingeckoId: 'wrapped-bitcoin' },
  ],
  sepolia: [
    { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', name: 'USD Coin (Testnet)', coingeckoId: 'usd-coin' },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', name: 'Uniswap', coingeckoId: 'uniswap' }, 
  ],
};