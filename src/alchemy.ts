import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from "alchemy-sdk";
import { ethers } from "ethers";

// ★APIキーはそのまま
const API_KEY = "XXXXX"; 

const NETWORK_MAP: Record<string, Network> = {
  mainnet: Network.ETH_MAINNET,
  sepolia: Network.ETH_SEPOLIA,
  polygon: Network.MATIC_MAINNET,
  optimism: Network.OPT_MAINNET,
  arbitrum: Network.ARB_MAINNET,
  base: Network.BASE_MAINNET,
  astar: Network.ASTAR_MAINNET,
};

const COINGECKO_PLATFORMS: Record<string, string> = {
  mainnet: "ethereum",
  polygon: "polygon-pos",
  optimism: "optimistic-ethereum",
  arbitrum: "arbitrum-one",
  base: "base",
  astar: "astar",
};

// ★修正: 価格データをJPY/USD両方持てる構造に変更
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
  // 通貨ごとのデータを持たせる
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
  type: 'send' | 'receive';
  amount: string;
  symbol: string;
  from: string;
  to: string;
  date: string;
  network: string;
};

// --- トークン一覧を取得する関数 (引数からcurrencyを削除) ---
export const fetchTokens = async (address: string, networkKey: string): Promise<TokenData[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];

  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);

  try {
    const balances = await alchemy.core.getTokenBalances(address);
    const tokens: TokenData[] = [];
    const contractAddresses: string[] = [];

    await Promise.all(
      balances.tokenBalances.map(async (token) => {
        if (token.tokenBalance === "0") return;
        try {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          const balanceFormatted = ethers.formatUnits(token.tokenBalance || "0", metadata.decimals || 18);
          
          if (parseFloat(balanceFormatted) < 0.0001) return;

          tokens.push({
            name: metadata.name || "Unknown",
            symbol: metadata.symbol || "???",
            balance: parseFloat(balanceFormatted).toFixed(4),
            logo: metadata.logo || "",
            address: token.contractAddress
          });
          contractAddresses.push(token.contractAddress);
        } catch (e) { console.warn(e); }
      })
    );

    // CoinGeckoで一括取得 (JPYとUSD両方)
    const platform = COINGECKO_PLATFORMS[networkKey];
    if (platform && contractAddresses.length > 0) {
      try {
        const addressesStr = contractAddresses.join(',');
        // vs_currencies=usd,jpy を指定
        const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addressesStr}&vs_currencies=usd,jpy&include_24hr_change=true`;
        
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
      } catch (e) { console.warn("Price fetch failed:", e); }
    }
    return tokens;
  } catch (error) {
    console.error("Alchemy Token Error:", error);
    return [];
  }
};

export const fetchNfts = async (address: string, networkKey: string): Promise<NftData[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];
  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);
  try {
    const nfts = await alchemy.nft.getNftsForOwner(address);
    return nfts.ownedNfts.map((nft) => {
      const img = nft.image?.cachedUrl || nft.image?.originalUrl || "https://via.placeholder.com/150?text=No+Image";
      const name = nft.name || `#${nft.tokenId}`;
      return { name: name, tokenId: nft.tokenId, image: img, collectionName: nft.contract.name || "Unknown" };
    });
  } catch (error) { console.error(error); return []; }
};

export const fetchTransactionHistory = async (address: string, networkKey: string): Promise<AlchemyHistory[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];

  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);

  try {
    const options = {
      fromBlock: "0x0",
      category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
      excludeZeroValue: true,
      order: SortingOrder.DESCENDING,
      maxCount: 50,
      withMetadata: true,
    };

    const incoming = await alchemy.core.getAssetTransfers({ ...options, toAddress: address });
    const outgoing = await alchemy.core.getAssetTransfers({ ...options, fromAddress: address });

    const formatTx = (tx: any, type: 'send' | 'receive'): AlchemyHistory => {
      let formattedDate = "Pending";
      if (tx.metadata && tx.metadata.blockTimestamp) {
        const d = new Date(tx.metadata.blockTimestamp);
        formattedDate = d.toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
      }

      return {
        id: tx.hash + type,
        hash: tx.hash,
        type: type,
        amount: tx.value?.toFixed(4) || "0",
        symbol: tx.asset || "ETH",
        from: tx.from,
        to: tx.to,
        date: formattedDate,
        network: networkKey,
      };
    };

    const inList = incoming.transfers.map(tx => formatTx(tx, 'receive'));
    const outList = outgoing.transfers.map(tx => formatTx(tx, 'send'));

    const merged = [...inList, ...outList]
      .sort((a, b) => {
        if (a.date === "Pending") return -1;
        if (b.date === "Pending") return 1;
        return b.date.localeCompare(a.date);
      })
      .slice(0, 50);

    return merged;

  } catch (error) {
    console.error("Alchemy History Error:", error);
    return [];
  }
};