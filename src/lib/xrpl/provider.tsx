"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Client } from "xrpl";
import { getClient } from "./client";

// コンテキストの型定義
interface XRPLClientContextType {
  client: Client | null;
  isConnecting: boolean;
  error: Error | null;
  reconnect: () => Promise<void>;
}

// デフォルト値の設定
const defaultContextValue: XRPLClientContextType = {
  client: null,
  isConnecting: false,
  error: null,
  reconnect: async () => {},
};

// コンテキストの作成
const XRPLClientContext = createContext<XRPLClientContextType>(defaultContextValue);

// プロバイダーコンポーネントのプロパティ型
interface XRPLClientProviderProps {
  children: ReactNode;
}

// カスタムフックを作成
export const useXRPLClient = () => useContext(XRPLClientContext);

// プロバイダーコンポーネント
export function XRPLClientProvider({ children }: XRPLClientProviderProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // クライアントを再接続する関数
  const reconnect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const newClient = await getClient();
      setClient(newClient);
    } catch (err) {
      console.error("XRPL接続エラー:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsConnecting(false);
    }
  };

  // コンポーネントがマウントされたときに初期接続を行う
  useEffect(() => {
    reconnect();
    
    // クリーンアップ関数
    return () => {
      if (client && client.isConnected()) {
        client.disconnect();
      }
    };
  }, []);

  // ウィンドウがフォーカスを取り戻したときに再接続
  useEffect(() => {
    const handleFocus = () => {
      if (!client || !client.isConnected()) {
        reconnect();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [client]);

  // コンテキスト値
  const contextValue: XRPLClientContextType = {
    client,
    isConnecting,
    error,
    reconnect,
  };

  return (
    <XRPLClientContext.Provider value={contextValue}>
      {children}
    </XRPLClientContext.Provider>
  );
} 