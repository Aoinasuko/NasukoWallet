import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from "alchemy-sdk";
import { ethers } from "ethers";
import type { TokenData, NftData, AlchemyHistory } from "./types";
import { UNISWAP_ADDRESSES } from "./constants";

import { ALCHEMY_API_KEY } from './apiConfig';

const API_KEY = ALCHEMY_API_KEY;

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

const KNOWN_DECIMALS: Record<string, number> = {
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": 6,
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,
};

// ★追加: 小さな数値も全桁文字列化するヘルパー
const formatFullNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return "0";
  if (num === 0) return "0";
  // 小数点以下20桁まで出して末尾の不要な0を消す
  return num.toFixed(20).replace(/\.?0+$/, "");
};

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
        if (!token.tokenBalance) return;
        
        const contractAddrLower = token.contractAddress.toLowerCase();

        let decimals = 18;
        let name = "Unknown";
        let symbol = "???";
        let logo = "";

        try {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          if (KNOWN_DECIMALS[contractAddrLower]) {
            decimals = KNOWN_DECIMALS[contractAddrLower];
          } else if (metadata.decimals !== null && metadata.decimals !== undefined) {
            decimals = metadata.decimals;
          }
          
          name = metadata.name || name;
          symbol = metadata.symbol || symbol;
          logo = metadata.logo || logo;

        } catch (e) { 
          if (KNOWN_DECIMALS[contractAddrLower]) {
            decimals = KNOWN_DECIMALS[contractAddrLower];
          }
        }

        const balanceFormatted = ethers.formatUnits(token.tokenBalance, decimals);
        
        // 残高が極小でも表示する場合はここを調整。一旦0.00000001以上とする
        if (parseFloat(balanceFormatted) < 0.00000001) return;

        tokens.push({
          name: name,
          symbol: symbol,
          balance: formatFullNumber(parseFloat(balanceFormatted)), // ★修正: 全桁表示
          logo: logo,
          address: token.contractAddress
        });
        contractAddresses.push(token.contractAddress);
      })
    );

    const platform = COINGECKO_PLATFORMS[networkKey];
    if (platform && contractAddresses.length > 0) {
      try {
        const addressesStr = contractAddresses.join(',');
        const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addressesStr}&vs_currencies=usd,jpy&include_24hr_change=true`;
        
        const res = await fetch(url);
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
      } catch (e) { console.warn("Price fetch failed:", e); }
    }
    return tokens;
  } catch (error) {
    console.error("Alchemy Token Error:", error);
    return [];
  }
};

// Lightweight held-token fetch for Runner/autotrade.
// - Uses Alchemy token balances + metadata
// - Does NOT call CoinGecko (avoids rate limits)
export const fetchHeldTokensBasic = async (address: string, networkKey: string): Promise<TokenData[]> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return [];

  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);

  try {
    const balances = await alchemy.core.getTokenBalances(address);
    const tokens: TokenData[] = [];

    await Promise.all(
      balances.tokenBalances.map(async (token) => {
        if (!token.tokenBalance) return;
        const contractAddrLower = token.contractAddress.toLowerCase();

        let decimals = 18;
        let name = 'Unknown';
        let symbol = '???';
        let logo = '';

        try {
          const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
          if (KNOWN_DECIMALS[contractAddrLower]) {
            decimals = KNOWN_DECIMALS[contractAddrLower];
          } else if (metadata.decimals !== null && metadata.decimals !== undefined) {
            decimals = metadata.decimals;
          }
          name = metadata.name || name;
          symbol = metadata.symbol || symbol;
          logo = metadata.logo || logo;
        } catch (e) {
          if (KNOWN_DECIMALS[contractAddrLower]) {
            decimals = KNOWN_DECIMALS[contractAddrLower];
          }
        }

        const balanceFormatted = ethers.formatUnits(token.tokenBalance, decimals);
        if (parseFloat(balanceFormatted) < 0.00000001) return;

        tokens.push({
          name,
          symbol,
          balance: formatFullNumber(parseFloat(balanceFormatted)),
          logo,
          address: token.contractAddress,
        });
      })
    );

    return tokens;
  } catch (error) {
    console.error('Alchemy Token Error:', error);
    return [];
  }
};

export const fetchTokenMetadataBasic = async (tokenAddress: string, networkKey: string): Promise<{ name: string; symbol: string; decimals: number; logo: string } | null> => {
  const network = NETWORK_MAP[networkKey];
  if (!network) return null;
  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);
  try {
    const md = await alchemy.core.getTokenMetadata(tokenAddress);
    return {
      name: md.name || 'Unknown',
      symbol: md.symbol || '???',
      decimals: (md.decimals ?? 18) as number,
      logo: md.logo || '',
    };
  } catch (e) {
    return null;
  }
};

export const fetchNfts = async (address: string, networkKey: string): Promise<NftData[]> => {
    // (省略: 変更なし)
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
    } catch (error) { return []; }
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
          
          // ★修正: toFixed(4) を廃止し、formatFullNumberを使用
          const sentAmount = sentAsset ? formatFullNumber(sentAsset.value) : "0";
          const recvAmount = receivedAsset ? formatFullNumber(receivedAsset.value) : "0";

          history.push({ 
            id: hash, 
            hash: hash, 
            type: 'swap', 
            amount: sentAmount, 
            symbol: `${sentSymbol} > ${recvSymbol}`, 
            from: myAddr, 
            to: myAddr, 
            date: date, 
            network: networkKey,
            receivedAmount: recvAmount
          });
        } else {
          if (sent.length > 0) {
            sent.forEach(tx => { 
                history.push({ 
                    id: tx.uniqueId, hash: tx.hash, type: 'send', 
                    amount: formatFullNumber(tx.value), // ★修正
                    symbol: tx.asset || "ETH", from: tx.from, to: tx.to, date: date, network: networkKey 
                }); 
            });
          }
          if (received.length > 0) {
            received.forEach(tx => { 
                history.push({ 
                    id: tx.uniqueId, hash: tx.hash, type: 'receive', 
                    amount: formatFullNumber(tx.value), // ★修正
                    symbol: tx.asset || "ETH", from: tx.from, to: tx.to, date: date, network: networkKey 
                }); 
            });
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

export const fetchTokenMetadataAndPrice = async (address: string, networkKey: string) => {
  // (省略: 変更なし)
  const network = NETWORK_MAP[networkKey];
  if (!network || !ethers.isAddress(address)) return null;
  const config = { apiKey: API_KEY, network };
  const alchemy = new Alchemy(config);
  try {
    const metadata = await alchemy.core.getTokenMetadata(address);
    if (!metadata.symbol) return null;
    let price = { usd: 0, jpy: 0 };
    const platform = COINGECKO_PLATFORMS[networkKey];
    if (platform) {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd,jpy`;
        const res = await fetch(url);
        const data = await res.json();
        const p = data[address.toLowerCase()];
        if (p) { price = { usd: p.usd || 0, jpy: p.jpy || 0 }; }
      } catch (e) {}
    }
    return {
      name: metadata.name || "Unknown",
      symbol: metadata.symbol || "???",
      decimals: metadata.decimals || 18,
      logo: metadata.logo || "",
      address: address,
      price: price
    };
  } catch (error) { return null; }
};