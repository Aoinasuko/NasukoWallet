// ==========================================
// 1. プロバイダー本体の定義
// ==========================================
const provider = {
  isMetaMask: true,      // レガシー対応: MetaMaskのフリをする
  isNasukoWallet: true,  // 自作の証
  
  // Remixが接続確認をするための関数
  isConnected: () => true,

  // リクエスト処理
  request: async ({ method, params }) => {
    console.log("NasukoWallet:", method, params);
    return new Promise((resolve, reject) => {
      window.postMessage({ type: "FROM_PAGE", text: { method, params } }, "*");
      
      const handler = (event) => {
        if (event.source !== window || !event.data || event.data.type !== "FROM_EXTENSION") return;
        const { result, error, originalMethod } = event.data;
        if (originalMethod === method) {
          window.removeEventListener("message", handler);
          if (error) reject(error);
          else resolve(result);
        }
      };
      window.addEventListener("message", handler);
    });
  },

  // イベントリスナー（空実装でエラー回避）
  on: () => {},
  removeListener: () => {}
};

// ==========================================
// 2. window.ethereum への注入 (レガシー方式)
// ==========================================
try {
  Object.defineProperty(window, "ethereum", {
    value: provider,
    writable: false,     // 上書き禁止！
    configurable: false
  });
  console.log("NasukoWallet: window.ethereum injected.");
} catch (e) {
  console.warn("NasukoWallet: window.ethereum already defined.");
}

// 昔ながらの "ethereum#initialized" イベントを発火 (MetaMaskの挙動模倣)
window.dispatchEvent(new Event("ethereum#initialized"));


// ==========================================
// 3. EIP-6963 (最新方式) のアナウンス
// ==========================================
// これをやると、Remixの環境選択に「NasukoWallet」自体が表示される可能性があります
const info = {
  uuid: "350670db-19fa-4704-a166-e52e178b59d2", // 適当なUUID
  name: "NasukoWallet",
  icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZmlsbD0iIzY0NmNmZiIgZD0iTTE2IDJMMiAyMmwxNCA4IDE0LThMMTYgMnoiLz48L3N2Zz4=",
  rdns: "com.nasukowallet"
};

const announce = () => {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info, provider }
    })
  );
};

// 今すぐアナウンス
announce();
// 少し遅れて聞いてくるアプリのために、リクエストがあったら再度アナウンス
window.addEventListener("eip6963:requestProvider", () => announce());

console.log("NasukoWallet: Fully Injected & Announced!");