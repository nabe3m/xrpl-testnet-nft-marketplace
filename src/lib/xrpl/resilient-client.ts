import { Client, ClientOptions } from "xrpl";
import RetryWebSocket from "retry-websocket";

// WebSocketの再接続設定
const WS_RETRY_CONFIG = {
  // 最大再試行回数
  maxReconnectionDelay: 10000, // 10秒
  minReconnectionDelay: 1000, // 1秒
  reconnectionDelayGrowFactor: 1.3, // 遅延増加係数
  connectionTimeout: 15000, // 接続タイムアウト
  maxRetries: 15, // 最大再試行回数
  debug: false, // デバッグモード
};

// 定数
const CONNECTION_TIMEOUT = 20000; // 20秒
const RECONNECT_DELAY = 2000; // 2秒

/**
 * 回復力のあるXRPLクライアント
 * 接続が切断された場合に自動的に再接続を試みる
 */
export class ResilientXrplClient {
  private client: Client | null = null;
  private url: string;
  private options: ClientOptions;
  private isConnecting: boolean = false;
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private _lastNotifiedStatus: boolean | null = null;
  private connectTimeoutId: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor(url: string, options: ClientOptions = {}) {
    this.url = url;
    this.options = options;
  }

  /**
   * クライアントに接続
   */
  async connect(): Promise<Client> {
    if (this.client && this.client.isConnected()) {
      return this.client;
    }

    if (this.isConnecting) {
      // 既に接続中の場合は接続が完了するまで待機
      return new Promise((resolve, reject) => {
        let timeoutId: NodeJS.Timeout | null = null;
        const checkInterval = setInterval(() => {
          if (this.client && this.client.isConnected()) {
            clearInterval(checkInterval);
            if (timeoutId) clearTimeout(timeoutId);
            resolve(this.client);
          }
        }, 100);
        
        // 待機タイムアウト
        timeoutId = setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("接続待機タイムアウト"));
        }, CONNECTION_TIMEOUT);
      });
    }

    try {
      this.isConnecting = true;
      
      // 接続タイムアウト処理を設定
      this.setConnectTimeout();

      // 新しいクライアントを作成
      this.client = new Client(this.url, {
        ...this.options,
        timeout: CONNECTION_TIMEOUT,
        connectionTimeout: CONNECTION_TIMEOUT,
      });

      // 接続イベントをモニタリング
      this.client.on("connected", () => {
        console.log("XRPL Client: 接続しました");
        this.clearConnectTimeout();
        this.reconnectAttempts = 0; // 接続成功したらリセット
        this.notifyConnectionStatus(true);
      });

      this.client.on("disconnected", (code: number, reason: string) => {
        console.log(`XRPL Client: 切断されました (${code}: ${reason})`);
        this.notifyConnectionStatus(false);
        
        // 異常切断時に自動的に再接続を試みる
        // 正常切断（1000, 1001）や再接続中の場合は再接続しない
        if (code !== 1000 && code !== 1001 && !this.isConnecting) {
          if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            console.log(`異常切断のため${RECONNECT_DELAY / 1000}秒後に再接続を試みます (試行 ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
            setTimeout(() => {
              this.reconnect().catch(e => console.error("自動再接続に失敗:", e));
            }, RECONNECT_DELAY);
          } else {
            console.error(`最大再接続試行回数 (${this.MAX_RECONNECT_ATTEMPTS}) に達しました`);
          }
        }
      });

      this.client.on("error", (error: Error) => {
        console.error("XRPL Client: エラーが発生しました", error);
        // エラー発生時にも再接続を試みるが、既に再接続中なら試みない
        if (!this.isConnecting && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          console.log(`エラー発生のため${RECONNECT_DELAY / 1000}秒後に再接続を試みます (試行 ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => {
            this.reconnect().catch(e => console.error("エラー後の再接続に失敗:", e));
          }, RECONNECT_DELAY);
        }
      });

      // 接続
      await this.client.connect();
      this.clearConnectTimeout();
      this.isConnecting = false;
      return this.client;
    } catch (error) {
      this.clearConnectTimeout();
      this.isConnecting = false;
      console.error("XRPL Client: 接続に失敗しました", error);
      
      // 接続失敗時にも再接続を試みる（ただし短時間に何度も再接続しないよう注意）
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        console.log(`接続失敗のため${RECONNECT_DELAY / 1000}秒後に再接続を試みます (試行 ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => {
          this.reconnect().catch(e => console.error("接続失敗後の再接続に失敗:", e));
        }, RECONNECT_DELAY);
      }
      
      throw error;
    }
  }
  
  /**
   * 接続タイムアウトを設定
   */
  private setConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimeoutId = setTimeout(() => {
      console.error(`接続タイムアウト (${CONNECTION_TIMEOUT / 1000}秒)`);
      if (this.client) {
        try {
          this.client.disconnect().catch(() => {});
        } catch (e) {
          // 切断エラーは無視
        }
        this.client = null;
      }
      this.isConnecting = false;
      this.notifyConnectionStatus(false);
    }, CONNECTION_TIMEOUT);
  }
  
  /**
   * 接続タイムアウトをクリア
   */
  private clearConnectTimeout(): void {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  /**
   * クライアントの接続状態を監視するリスナーを追加
   */
  addConnectionListener(listener: (connected: boolean) => void): void {
    this.connectionListeners.push(listener);
    // 現在の接続状態を即座に通知（ただし一度だけ）
    if (this.client) {
      listener(this.client.isConnected());
    } else {
      listener(false);
    }
  }

  /**
   * 接続状態の変更を通知
   */
  private notifyConnectionStatus(connected: boolean): void {
    // すでに前回と同じ状態であれば通知しない
    if (this._lastNotifiedStatus === connected) {
      return;
    }
    this._lastNotifiedStatus = connected;
    
    // すべてのリスナーに通知
    this.connectionListeners.forEach((listener) => {
      try {
        listener(connected);
      } catch (err) {
        console.error("リスナー通知中にエラーが発生:", err);
      }
    });
    
    // ブラウザイベントとしても発行（DOMイベントのみブラウザ環境で）
    if (typeof window !== 'undefined') {
      const eventName = connected ? 'xrpl-connected' : 'xrpl-disconnected';
      window.dispatchEvent(new Event(eventName));
    }
  }

  /**
   * クライアントを切断
   */
  async disconnect(): Promise<void> {
    this.clearConnectTimeout();
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        console.error("切断中にエラーが発生:", error);
      }
      this.client = null;
      this.notifyConnectionStatus(false);
    }
  }

  /**
   * 現在のクライアントを取得（接続されていない場合は新しく接続）
   */
  async getClient(): Promise<Client> {
    try {
      return this.connect();
    } catch (error) {
      console.error("クライアント取得エラー:", error);
      throw error;
    }
  }

  /**
   * 接続が存在するかチェック
   */
  isConnected(): boolean {
    return this.client !== null && this.client.isConnected();
  }

  /**
   * 強制的に再接続
   */
  async reconnect(): Promise<Client> {
    this.clearConnectTimeout();
    
    // 既に接続中なら何もしない
    if (this.isConnecting) {
      console.log("既に接続処理中のため、再接続をスキップします");
      // 既存の接続が完了するのを待つ
      if (this.client) {
        try {
          const timeoutPromise = new Promise<Client>((_, reject) => {
            setTimeout(() => reject(new Error("接続待機タイムアウト")), CONNECTION_TIMEOUT);
          });
          
          const connectionPromise = new Promise<Client>((resolve) => {
            const checkInterval = setInterval(() => {
              if (this.client && this.client.isConnected()) {
                clearInterval(checkInterval);
                resolve(this.client);
              }
            }, 100);
          });
          
          return Promise.race([connectionPromise, timeoutPromise]);
        } catch (error) {
          console.error("接続待機中にエラー:", error);
          throw error;
        }
      }
    }

    // 既に接続されている場合は単にクライアントを返す
    if (this.client && this.client.isConnected()) {
      return this.client;
    }

    try {
      // 前のクライアントがあれば切断
      if (this.client) {
        console.log("再接続のため既存の接続を切断します");
        try {
          await this.client.disconnect();
        } catch (error) {
          console.error("切断中にエラーが発生しました:", error);
        }
        this.client = null;
      }

      // 少し待機してから新しい接続を作成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 新しい接続を作成
      console.log("新しい接続を作成します");
      return this.connect();
    } catch (error) {
      console.error("再接続中にエラーが発生しました:", error);
      throw error;
    }
  }
} 