import type { TokenData } from '../types';

const COINGECKO_PLATFORMS: Record<string, string> = {
  mainnet: "ethereum",
  sepolia: "ethereum",
  polygon: "polygon-pos",
  optimism: "optimistic-ethereum",
  arbitrum: "arbitrum-one",
  base: "base",
  astar: "astar",
};

const DEXSCREENER_NETWORKS: Record<string, string> = {
  mainnet: "ethereum",
  polygon: "polygon",
  optimism: "optimism",
  arbitrum: "arbitrum",
  base: "base",
  astar: "astar",
  // SepoliaはDexScreenerでサポートが薄いが一応ethereumで試行可能かもしれない
  // しかし公式docにはないため、ここでは除外するか、あるいはethereumとして試す
};

export const updateTokenPrices = async (tokens: TokenData[], networkKey: string): Promise<TokenData[]> => {
  const addresses = tokens.map(t => t.address).filter(a => a);
  if (addresses.length === 0) return tokens;

  // 1. Get USD/JPY Rate
  let usdToJpy = 150; // default fallback
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=jpy');
    const data = await res.json();
    if (data.tether?.jpy) {
      usdToJpy = data.tether.jpy;
    }
  } catch (e) {
    console.warn("Failed to fetch USD/JPY rate, using default", e);
  }

  // 2. Fetch from CoinGecko
  const cgPlatform = COINGECKO_PLATFORMS[networkKey];
  if (cgPlatform) {
    try {
      // CoinGecko allows multiple addresses comma-separated
      const addressesStr = addresses.join(',');
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${cgPlatform}?contract_addresses=${addressesStr}&vs_currencies=usd,jpy&include_24hr_change=true`;

      const res = await fetch(url);
      const priceData = await res.json();

      tokens.forEach(token => {
        const data = priceData[token.address.toLowerCase()];
        if (data) {
          token.market = {
            jpy: { price: data.jpy || 0, change: data.jpy_24h_change || 0 },
            usd: { price: data.usd || 0, change: data.usd_24h_change || 0 }
          };
        }
      });
    } catch (e) {
      console.warn("CoinGecko fetch failed:", e);
    }
  }

  // 3. Identify missing tokens and fetch from Dex Screener
  const missingTokens = tokens.filter(t => !t.market);
  // DexScreener only supports specific chains
  const dsNetworkId = DEXSCREENER_NETWORKS[networkKey];

  if (missingTokens.length > 0 && dsNetworkId) {
    try {
      // DexScreener API: https://api.dexscreener.com/latest/dex/tokens/:tokenAddresses
      // Supports up to 30 addresses. If more, we should chunk, but for now assuming < 30.
      const addressesStr = missingTokens.map(t => t.address).join(',');
      const url = `https://api.dexscreener.com/latest/dex/tokens/${addressesStr}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data && data.pairs) {
        // Pairs may contain multiple entries for same token. We usually take the one with highest liquidity or just first one matching.
        // DexScreener results are flat list of pairs.

        missingTokens.forEach(token => {
            // Find a pair for this token
            // Note: DexScreener response `baseToken.address` or `quoteToken.address` matches our token
            // We want pairs where our token is the base token usually, but sometimes it is quote.
            // DexScreener returns pairs. We filter for pairs on the correct chain (though endpoint is global, we can check chainId)

            const pair = data.pairs.find((p: any) =>
                p.chainId === dsNetworkId &&
                p.baseToken.address.toLowerCase() === token.address.toLowerCase()
            );

            if (pair) {
                const usdPrice = parseFloat(pair.priceUsd) || 0;
                const change24h = pair.priceChange?.h24 || 0;

                // Calculate JPY
                const jpyPrice = usdPrice * usdToJpy;

                token.market = {
                    usd: { price: usdPrice, change: change24h },
                    jpy: { price: jpyPrice, change: change24h } // DexScreener only gives USD change, assuming same % change for JPY
                };
            }
        });
      }
    } catch (e) {
        console.warn("Dex Screener fetch failed:", e);
    }
  }

  return tokens;
};
