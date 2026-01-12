import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from "alchemy-sdk";
import { ethers } from "ethers";
import type { TokenData, NftData, AlchemyHistory } from "./types";
import { UNISWAP_ADDRESSES } from "./constants"; // ★追加: ルーターアドレス判定用

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

// ... fetchTokens, fetchNfts は変更なし ...
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
    const platform = COINGECKO_PLATFORMS[networkKey];
    if (platform && contractAddresses.length > 0) {
      try {
        const addressesStr = contractAddresses.join(',');
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
  } catch (error) { console.error("Alchemy Token Error:", error); return []; }
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

// --- ★修正: 履歴取得 (スワップ結合ロジック) ---
export const fetchTransactionHistory = async (address: string, networkKey: string): Promise<AlchemyHistory[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];

  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);
  const myAddr = address.toLowerCase();

  // ルーターアドレスの取得 (判定用)
  const routerAddr = UNISWAP_ADDRESSES[networkKey]?.ROUTER?.toLowerCase();

  try {
    const options = {
      fromBlock: "0x0",
      category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
      excludeZeroValue: true,
      order: SortingOrder.DESCENDING,
      maxCount: 100, // マージするために多めに取得
      withMetadata: true,
    };

    // 送信と受信を一括取得
    const [incoming, outgoing] = await Promise.all([
      alchemy.core.getAssetTransfers({ ...options, toAddress: address }),
      alchemy.core.getAssetTransfers({ ...options, fromAddress: address })
    ]);

    // 1. ハッシュごとにグループ化
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

    // 2. グループごとに判定して履歴データを生成
    const history: AlchemyHistory[] = [];

    Object.entries(txMap).forEach(([hash, data]) => {
      const { sent, received, date } = data;

      // A. スワップ判定: 「送信」と「受信」が両方ある OR 送信先がルーター
      // (テストネットだと受信イベントのインデックスが遅れることがあるため、ルーター宛ならスワップとみなす)
      const isSwapToRouter = sent.some(tx => tx.to && tx.to.toLowerCase() === routerAddr);
      const isSwap = (sent.length > 0 && received.length > 0) || isSwapToRouter;

      if (isSwap) {
        // スワップとして登録
        const sentAsset = sent[0];
        const receivedAsset = received[0]; // ない場合はundefined

        const sentSymbol = sentAsset ? sentAsset.asset : "???";
        const recvSymbol = receivedAsset ? receivedAsset.asset : (isSwapToRouter ? "Token" : "???");
        
        const sentAmount = sentAsset ? sentAsset.value?.toFixed(4) : "0";
        // const recvAmount = receivedAsset ? receivedAsset.value?.toFixed(4) : "?";

        history.push({
          id: hash,
          hash: hash,
          type: 'swap', // ★タイプをswapに
          amount: sentAmount, // とりあえず送信額を表示
          symbol: `${sentSymbol} > ${recvSymbol}`, // シンボルを「ETH > USDC」のように結合
          from: myAddr, // 自分のアドレスにしておく(フィルタ用)
          to: myAddr,
          date: date,
          network: networkKey,
        });

      } else {
        // B. 通常の送金・入金
        if (sent.length > 0) {
          sent.forEach(tx => {
            history.push({
              id: tx.uniqueId,
              hash: tx.hash,
              type: 'send',
              amount: tx.value?.toFixed(4) || "0",
              symbol: tx.asset || "ETH",
              from: tx.from,
              to: tx.to,
              date: date,
              network: networkKey,
            });
          });
        }
        if (received.length > 0) {
          received.forEach(tx => {
            history.push({
              id: tx.uniqueId,
              hash: tx.hash,
              type: 'receive',
              amount: tx.value?.toFixed(4) || "0",
              symbol: tx.asset || "ETH",
              from: tx.from,
              to: tx.to,
              date: date,
              network: networkKey,
            });
          });
        }
      }
    });

    // 日付順にソートして50件返す
    return history.sort((a, b) => {
        if (a.date === "Pending") return -1;
        if (b.date === "Pending") return 1;
        return b.date.localeCompare(a.date);
      }).slice(0, 50);

  } catch (error) {
    console.error("Alchemy History Error:", error);
    return [];
  }
};