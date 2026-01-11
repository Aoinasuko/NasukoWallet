const injectScript = () => {
  try {
    const container = document.head || document.documentElement;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    // 一番最初に実行されるように、prepend（先頭に追加）を使う
    container.insertBefore(script, container.children[0]);
  } catch (e) {
    console.error('NasukoWallet injection failed', e);
  }
};

// まだDOMがないかもしれないのでチェックして実行
injectScript();

// メッセージリスナーは今まで通り
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.type !== "FROM_PAGE") return;

  chrome.runtime.sendMessage(event.data.text, (response) => {
    window.postMessage({
      type: "FROM_EXTENSION",
      result: response ? response.result : null,
      error: response ? response.error : "No response",
      originalMethod: event.data.text.method
    }, "*");
  });
});