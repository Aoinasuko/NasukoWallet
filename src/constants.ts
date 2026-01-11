// src/constants.ts
import type { NetworkConfig } from './types';

// ★修正: ロゴ画像を追加し、型をNetworkConfigに統一
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
    logo: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/icon/eth.png" // テストネットは白黒アイコン等で区別
  },
};

export const DEX_URLS: Record<string, string> = {
  mainnet: "https://app.uniswap.org/", polygon: "https://quickswap.exchange/", bsc: "https://pancakeswap.finance/", 
  avalanche: "https://traderjoexyz.com/", optimism: "https://app.uniswap.org/", arbitrum: "https://app.uniswap.org/",
  base: "https://app.uniswap.org/", astar: "https://app.arthswap.org/", sepolia: "https://app.uniswap.org/",
};