import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from "alchemy-sdk";
import { ethers } from "ethers";
import type { TokenData, NftData, AlchemyHistory } from "./types";
import { UNISWAP_ADDRESSES } from "./constants"; 

// ★APIキーはそのまま
const API_KEY = "B4Dt5cTQ4Sp-8Dv81q-zi"; 

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

// --- トークン一覧を取得する関数 (エラー回避・安定版) ---
export const fetchTokens = async (address: string, networkKey: string): Promise<TokenData[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];

  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);

  try {
    // ★修正: 特定のアドレス指定をやめ、シンプルな全件取得のみにする
    // これにより "missing response" エラーを回避します
    const balances = await alchemy.core.getTokenBalances(address);
    
    const tokens: TokenData[] = [];
    const contractAddresses: string[] = [];

    await Promise.all(
      balances.tokenBalances.map(async (token) => {
        // 残高0、または不正なデータはスキップ
        if (!token.tokenBalance || token.tokenBalance === "0") return;
        
        try {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          const balanceFormatted = ethers.formatUnits(token.tokenBalance, metadata.decimals || 18);
          
          // 0.0001以下など微小な残高はスキップ
          if (parseFloat(balanceFormatted) < 0.0001) return;

          tokens.push({
            name: metadata.name || "Unknown",
            symbol: metadata.symbol || "???",
            balance: parseFloat(balanceFormatted).toFixed(4),
            logo: metadata.logo || "",
            address: token.contractAddress
          });
          contractAddresses.push(token.contractAddress);
        } catch (e) { 
          console.warn("Metadata fetch error for:", token.contractAddress); 
        }
      })
    );

    // CoinGeckoで価格取得 (変更なし)
    const platform = COINGECKO_PLATFORMS[networkKey];
    if (platform && contractAddresses.length > 0) {
      try {
        const addressesStr = contractAddresses.join(',');
        const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addressesStr}&vs_currencies=usd,jpy&include_24hr_change=true`;
        
        const res = await fetch(url);
        // エラーでも空オブジェクトを返して続行させる
        const priceData = res.ok ? await res.json() : {};

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
        console.warn("Price fetch failed:", e); 
      }
    }
    return tokens;
  } catch (error) {
    // 致命的なエラーでも、空配列を返してアプリをクラッシュさせない
    console.error("Alchemy Token Error:", error);
    return [];
  }
};

// ... (fetchNfts, fetchTransactionHistory は変更なし) ...
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
  const myAddr = address.toLowerCase();
  const routerAddr = UNISWAP_ADDRESSES[networkKey]?.ROUTER?.toLowerCase();

  try {
    const options = {
      fromBlock: "0x0", category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20], excludeZeroValue: true, order: SortingOrder.DESCENDING, maxCount: 100, withMetadata: true,
    };
    const [incoming, outgoing] = await Promise.all([
      alchemy.core.getAssetTransfers({ ...options, toAddress: address }),
      alchemy.core.getAssetTransfers({ ...options, fromAddress: address })
    ]);

    const txMap: Record<string, { sent: any[], received: any[], date: string }> = {};
    const addToMap = (tx: any, type: 'sent' | 'received') => {
      if (!txMap[tx.hash]) {
        let date = "Pending";
        if (tx.metadata && tx.metadata.blockTimestamp) {
          const d = new Date(tx.metadata.blockTimestamp);
          date = d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        }
        txMap[tx.hash] = { sent: [], received: [], date };
      }
      txMap[tx.hash][type].push(tx);
    };
    outgoing.transfers.forEach(tx => addToMap(tx, 'sent'));
    incoming.transfers.forEach(tx => addToMap(tx, 'received'));

    const history: AlchemyHistory[] = [];
    Object.entries(txMap).forEach(([hash, data]) => {
      const { sent, received, date } = data;
      const isSwapToRouter = sent.some(tx => tx.to && tx.to.toLowerCase() === routerAddr);
      const isSwap = (sent.length > 0 && received.length > 0) || isSwapToRouter;

      if (isSwap) {
        const sentAsset = sent[0];
        const receivedAsset = received[0];
        const sentSymbol = sentAsset ? sentAsset.asset : "???";
        const recvSymbol = receivedAsset ? receivedAsset.asset : (isSwapToRouter ? "Token" : "???");
        const sentAmount = sentAsset ? sentAsset.value?.toFixed(4) : "0";
        history.push({ id: hash, hash: hash, type: 'swap', amount: sentAmount, symbol: `${sentSymbol} > ${recvSymbol}`, from: myAddr, to: myAddr, date: date, network: networkKey });
      } else {
        if (sent.length > 0) {
          sent.forEach(tx => { history.push({ id: tx.uniqueId, hash: tx.hash, type: 'send', amount: tx.value?.toFixed(4) || "0", symbol: tx.asset || "ETH", from: tx.from, to: tx.to, date: date, network: networkKey }); });
        }
        if (received.length > 0) {
          received.forEach(tx => { history.push({ id: tx.uniqueId, hash: tx.hash, type: 'receive', amount: tx.value?.toFixed(4) || "0", symbol: tx.asset || "ETH", from: tx.from, to: tx.to, date: date, network: networkKey }); });
        }
      }
    });
    return history.sort((a, b) => {
        if (a.date === "Pending") return -1;
        if (b.date === "Pending") return 1;
        return b.date.localeCompare(a.date);
      }).slice(0, 50);
  } catch (error) { console.error("Alchemy History Error:", error); return []; }
};