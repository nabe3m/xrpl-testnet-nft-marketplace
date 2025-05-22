"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Button } from "./button";
import { checkConnection, reconnectClient } from "@/lib/xrpl/client";

export function ConnectionStatus() {
  // 状態の更新を最小限に抑える
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  // 最新の接続状態を保存するref（レンダリングをトリガーせずに値を保持）
  const connectedRef = useRef(false);
  
  // 初回マウント時のみ実行される処理
  useEffect(() => {
    // 初期状態を設定
    const initialStatus = checkConnection();
    connectedRef.current = initialStatus;
    setIsConnected(initialStatus);
    
    // イベントハンドラー（クロージャーの問題を避けるためにrefを使用）
    function handleConnected() {
      if (!connectedRef.current) {
        connectedRef.current = true;
        setIsConnected(true);
      }
    }
    
    function handleDisconnected() {
      if (connectedRef.current) {
        connectedRef.current = false;
        setIsConnected(false);
      }
    }
    
    // フォーカス時のハンドラー
    function handleFocus() {
      const currentStatus = checkConnection();
      // 状態が実際に変化した場合のみ更新
      if (connectedRef.current !== currentStatus) {
        connectedRef.current = currentStatus;
        setIsConnected(currentStatus);
      }
    }
    
    // イベントリスナーを登録
    window.addEventListener("xrpl-connected", handleConnected);
    window.addEventListener("xrpl-disconnected", handleDisconnected);
    window.addEventListener("focus", handleFocus);
    
    // クリーンアップ
    return () => {
      window.removeEventListener("xrpl-connected", handleConnected);
      window.removeEventListener("xrpl-disconnected", handleDisconnected);
      window.removeEventListener("focus", handleFocus);
    };
  }, []); // 依存配列を空に保つ（初回マウント時のみ実行）
  
  // 再接続ハンドラー
  const handleReconnect = useCallback(async () => {
    if (isReconnecting) return; // 既に再接続中なら何もしない
    
    setIsReconnecting(true);
    try {
      await reconnectClient();
      // 状態の更新はイベントリスナー経由で行われる
    } catch (error) {
      console.error("再接続に失敗しました:", error);
    } finally {
      setIsReconnecting(false);
    }
  }, [isReconnecting]);
  
  // 接続中の表示
  if (isConnected) {
    return (
      <div className="flex items-center space-x-2 text-green-500">
        <Wifi className="h-4 w-4" />
        <span className="text-xs">Connected to XRPL</span>
      </div>
    );
  }
  
  // 未接続時の表示
  return (
    <div className="flex flex-col items-start">
      <div className="flex items-center space-x-2 text-red-500 mb-1">
        <WifiOff className="h-4 w-4" />
        <span className="text-xs">No XRPL Connection</span>
      </div>
    </div>
  );
} 