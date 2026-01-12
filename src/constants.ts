import type { NetworkConfig } from './types';

// ... (DEFAULT_NETWORKS は変更なし) ...
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

// ★修正: MATICのアドレスを追加
export const UNISWAP_ADDRESSES: Record<string, { ROUTER: string; WETH: string; USDC: string; MATIC?: string }> = {
  sepolia: {
    ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // V3 Router
    WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // Sepolia WETH
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC (Faucet)
    MATIC: "0x789218204648c3226a32332617300305a463a033", // Dummy MATIC
  },
  mainnet: {
    ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564", 
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 
    MATIC: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", // Mainnet MATIC
  }
};