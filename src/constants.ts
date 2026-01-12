// src/constants.ts

import type { NetworkConfig } from './types';

// ... (DEFAULT_NETWORKS は変更なし)
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: { 
    name: "Ethereum", rpc: "https://1rpc.io/eth", chainId: "1", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://etherscan.io/tx/", color: "#627EEA",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eth.png"
  },
  polygon: { 
    name: "Polygon", rpc: "https://1rpc.io/matic", chainId: "137", symbol: "POL", coingeckoId: "polygon-ecosystem-token", 
    explorer: "https://polygonscan.com/tx/", color: "#8247E5",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/matic.png"
  },
  bsc: { 
    name: "BNB Chain", rpc: "https://1rpc.io/bnb", chainId: "56", symbol: "BNB", coingeckoId: "binancecoin", 
    explorer: "https://bscscan.com/tx/", color: "#F3BA2F",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bnb.png"
  },
  avalanche: { 
    name: "Avalanche", rpc: "https://1rpc.io/avax/c", chainId: "43114", symbol: "AVAX", coingeckoId: "avalanche-2", 
    explorer: "https://snowtrace.io/tx/", color: "#E84142",
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/avax.png"
  },
  optimism: { 
    name: "Optimism", rpc: "https://1rpc.io/op", chainId: "10", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://optimistic.etherscan.io/tx/", color: "#FF0420",
    logo: "https://assets.coingecko.com/coins/images/25244/standard/Optimism.png"
  },
  arbitrum: { 
    name: "Arbitrum", rpc: "https://1rpc.io/arb", chainId: "42161", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://arbiscan.io/tx/", color: "#2D374B",
    logo: "https://assets.coingecko.com/coins/images/16547/standard/arbitrum.jpg"
  },
  base: { 
    name: "Base", rpc: "https://1rpc.io/base", chainId: "8453", symbol: "ETH", coingeckoId: "ethereum", 
    explorer: "https://basescan.org/tx/", color: "#0052FF",
    logo: "https://assets.coingecko.com/coins/images/31199/standard/base.png"
  },
  astar: { 
    name: "Astar", rpc: "https://1rpc.io/astr", chainId: "592", symbol: "ASTR", coingeckoId: "astar", 
    explorer: "https://astar.subscan.io/extrinsic/", color: "#1b6dc1",
    logo: "https://assets.coingecko.com/coins/images/23567/standard/astar.png"
  },
  sepolia: { 
    name: "Sepolia", rpc: "https://1rpc.io/sepolia", chainId: "11155111", symbol: "SepoliaETH", coingeckoId: "ethereum", 
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
export const UNISWAP_ADDRESSES: Record<string, { ROUTER: string; WETH: string; USDC: string; MATIC?: string; POL?: string }> = {
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
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WMATIC on Polygon is usually just wrapped native, but here WETH on Polygon
    // Polygon Native is POL/MATIC. WETH is 0x7ce...
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    MATIC: "0x0000000000000000000000000000000000001010", // Native Token System Contract
  },
  optimism: {
    ROUTER: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x0b2C639c533813f4Aa9D7837CAf992cL92055", // Example
  }
  // 他チェーンも Router02 は 0x68b3... が一般的
};

// ★追加: 主要トークンリスト
export const MAJOR_TOKENS_LIST: Record<string, { symbol: string; address: string; name: string }[]> = {
  mainnet: [
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', name: 'USD Coin' },
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', name: 'Tether USD' },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', name: 'Dai Stablecoin' },
    { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', name: 'Wrapped BTC' },
    { symbol: 'POL', address: '0x455e53CBB86018Ac83880C351181737001F9392c', name: 'Polygon Ecosystem Token' },
    { symbol: 'MATIC', address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', name: 'Polygon (Old)' },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', name: 'Uniswap' },
    { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', name: 'Chainlink' },
    { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', name: 'Aave' },
    { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', name: 'Pepe' },
    { symbol: 'SHIB', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', name: 'Shiba Inu' },
  ],
  polygon: [
    { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', name: 'USD Coin (Native)' },
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', name: 'Tether USD' },
    { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', name: 'Wrapped Ether' },
    { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', name: 'Wrapped BTC' },
  ],
  sepolia: [
    { symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', name: 'USD Coin (Testnet)' },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', name: 'Uniswap' }, // May vary
  ],
  // 他のネットワークはデフォルト空配列
};