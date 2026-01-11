// public/background.js

// デフォルト設定
let currentRpcUrl = "https://1rpc.io/sepolia";
let currentChainId = "11155111"; // Sepolia

const proxyRequest = async (method, params) => {
  try {
    const response = await fetch(currentRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: method,
        params: params || [],
      }),
    });
    const data = await response.json();
    return data.error ? null : data.result;
  } catch (error) {
    console.error("Fetch Error:", error);
    return null;
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    // --- 設定変更の通知 ---
    if (request.type === "NETWORK_CHANGED") {
      console.log("Network changed to:", request.payload);
      currentRpcUrl = request.payload.rpcUrl;
      currentChainId = request.payload.chainId;
      sendResponse({ status: "OK" });
      return;
    }

    // --- ウォレット操作 ---
    if (request.type === "WALLET_UNLOCKED") {
      await chrome.storage.session.set({ currentAccount: request.address });
      sendResponse({ status: "OK" });
      return;
    }
    
    if (request.type === "WALLET_LOCKED") {
      await chrome.storage.session.remove("currentAccount");
      sendResponse({ status: "OK" });
      return;
    }

    // --- RPCリクエスト処理 ---
    const data = await chrome.storage.session.get("currentAccount");
    const currentAccount = data.currentAccount || null;
    const { method, params } = request;

    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        sendResponse({ result: currentAccount ? [currentAccount] : [] });
        break;

      case "eth_chainId":
        // 16進数に変換して返す
        sendResponse({ result: "0x" + parseInt(currentChainId).toString(16) }); 
        break;

      case "net_version":
        sendResponse({ result: currentChainId.toString() });
        break;
        
      case "eth_blockNumber":
      case "eth_getBlockByNumber":
      case "eth_gasPrice":
      case "eth_estimateGas":
      case "eth_getBalance":
      case "eth_call":
      case "eth_getCode":
      case "eth_sendRawTransaction": // 送金もプロキシする
        const result = await proxyRequest(method, params);
        sendResponse({ result: result });
        break;

      default:
        sendResponse({ result: null });
    }
  })();
  return true;
});