import { Client } from "xrpl";
import { ResilientXrplClient } from "./resilient-client";
import { toast } from "sonner";

// NFTをサポートする確実なサーバー
const MAIN_SERVER = "wss://s.altnet.rippletest.net:51233/"; // DevNet - NFTをサポート

// 回復力のあるXRPLクライアントのインスタンス
let resilientClient: ResilientXrplClient | null = null;
let isReconnecting = false;
let failedAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;

// コネクション状態の変更をグローバルイベントとして発信
function setupConnectionEvents(client: ResilientXrplClient) {
  client.addConnectionListener((connected) => {
    if (connected) {
      window.dispatchEvent(new CustomEvent('xrpl-connected'));
      // 接続が成功したらカウンターをリセット
      failedAttempts = 0;
    } else {
      window.dispatchEvent(new CustomEvent('xrpl-disconnected'));
    }
  });
}

// エラーハンドリング付きでクライアントを取得または初期化する関数
export async function getClient(): Promise<Client> {
  if (!resilientClient) {
    console.log(`Initializing resilient XRPL client with server: ${MAIN_SERVER}`);
    resilientClient = new ResilientXrplClient(MAIN_SERVER, {
      connectionTimeout: 20000, // 接続タイムアウト（20秒）
      timeout: 20000, // リクエストタイムアウト
    });
    
    // 接続イベントを設定
    setupConnectionEvents(resilientClient);
  }

  try {
    return await resilientClient.getClient();
  } catch (error) {
    failedAttempts++;
    console.error(`XRPL接続エラー (試行 ${failedAttempts}/${MAX_RETRY_ATTEMPTS}):`, error);
    
    // 最大試行回数に達していない場合は再試行
    if (failedAttempts < MAX_RETRY_ATTEMPTS) {
      console.log(`自動的に再接続を試みます... (${failedAttempts}/${MAX_RETRY_ATTEMPTS})`);
      return forceReconnect();
    }
    
    // 最大試行回数に達した場合はエラーを表示してスローする
    if (typeof window !== 'undefined') {
      toast.error("XRPLサーバーへの接続に問題があります。更新ボタンをクリックして再試行してください。");
    }
    throw new Error("XRPL接続の最大試行回数に達しました");
  }
}

// クライアントを切断する関数
export async function disconnectClient(): Promise<void> {
  if (resilientClient) {
    console.log("Disconnecting from XRPL...");
    try {
      await resilientClient.disconnect();
      console.log("Disconnected from XRPL");
    } catch (error) {
      console.error("Error disconnecting from XRPL:", error);
    }
  }
}

// クライアントを再接続する関数
export async function reconnectClient(): Promise<Client> {
  if (isReconnecting) {
    console.log("すでに再接続処理中です...");
    return getClient(); // 現在の接続を返す
  }
  
  isReconnecting = true;
  
  try {
    if (resilientClient) {
      console.log("XRPLクライアントを再接続中...");
      const client = await resilientClient.reconnect();
      console.log("XRPLクライアントの再接続に成功しました");
      return client;
    }
    return getClient();
  } catch (error) {
    console.error("XRPLクライアント再接続エラー:", error);
    throw error;
  } finally {
    isReconnecting = false;
  }
}

// 接続状態を確認する関数
export function checkConnection(): boolean {
  return resilientClient !== null && resilientClient.isConnected();
}

// 強制的に接続を更新する関数
export async function forceReconnect(): Promise<Client> {
  try {
    console.log("XRPL接続を強制的に更新中...");
    if (resilientClient) {
      // 古い接続を一度破棄してから再接続
      try {
        await resilientClient.disconnect();
      } catch (e) {
        // 切断エラーは無視
        console.warn("切断中にエラーが発生しましたが、続行します:", e);
      }
      
      // 一時的にインスタンスをnullに設定して新しいインスタンスを作成
      resilientClient = null;
    }
    
    // 新しいクライアントを取得
    return getClient();
  } catch (error) {
    console.error("強制再接続エラー:", error);
    throw error;
  }
}

// アプリケーション開始時に自動的に接続を確立
if (typeof window !== 'undefined') {
  // クライアントサイドの場合（ブラウザ環境）
  window.addEventListener('load', () => {
    console.log("Application loaded, establishing XRPL connection...");
    getClient().catch(err => {
      console.error("Initial connection failed:", err);
    });
  });
} 