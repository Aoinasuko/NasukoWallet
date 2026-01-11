import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from "alchemy-sdk";
import { ethers } from "ethers";
import type { TokenData, NftData, AlchemyHistory } from "./types";
import { updateTokenPrices } from "./services/priceService";

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

// --- トークン一覧を取得する関数 ---
export const fetchTokens = async (address: string, networkKey: string): Promise<TokenData[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];

  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);

  try {
    const balances = await alchemy.core.getTokenBalances(address);
    const tokens: TokenData[] = [];

    // Alchemyのmetadata取得は並列で行う
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
        } catch (e) { console.warn(e); }
      })
    );

    // 価格情報の取得をサービスに委譲
    if (tokens.length > 0) {
        await updateTokenPrices(tokens, networkKey);
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
