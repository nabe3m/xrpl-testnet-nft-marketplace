"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClient, reconnectClient, forceReconnect, checkConnection, disconnectClient } from "@/lib/xrpl/client";
import { createAllWallets, WalletState, WalletType, updateWalletBalance } from "@/lib/xrpl/wallet";
import { saveWallets, getWallets, clearWallets, saveActiveWalletType, getActiveWalletType } from "@/lib/storage";
import { WalletSelector } from "./WalletSelector";
import { WalletInfo } from "./WalletInfo";
import { ConnectionStatus as ConnectionStatusType } from "@/lib/types";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { useAppStore } from "@/lib/store";

// 残高更新間隔（ミリ秒）
const BALANCE_UPDATE_INTERVAL = 30000; // 30秒
// 接続再試行の最大回数
const MAX_RECONNECT_ATTEMPTS = 3;

export function WalletManager() {
  const [wallets, setWallets] = useState<Record<WalletType, WalletState> | null>(null);
  const [activeWalletType, setActiveWalletType] = useState<WalletType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // グローバルステートを使用
  const { 
    startWalletSwitch, 
    finishWalletSwitch, 
    isWalletSwitching,
    isLocked 
  } = useAppStore();

  // クライアント接続を安全に取得する関数
  const getSafeClient = useCallback(async () => {
    try {
      // 接続が既に何度か失敗している場合は強制再接続
      if (reconnectAttempts > 1) {
        console.log(`接続試行回数が${reconnectAttempts}回に達したため、強制再接続を試みます`);
        setConnectionStatus('connecting');
        const client = await forceReconnect();
        setConnectionStatus('connected');
        setReconnectAttempts(0); // 成功したらリセット
        return client;
      }

      // 通常の接続
      return await getClient();
    } catch (error) {
      console.error("クライアント接続エラー:", error);
      setConnectionStatus('disconnected');
      setReconnectAttempts(prev => prev + 1);
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        toast.error("サーバーへの接続に問題があります。後ほど再試行してください。");
        setReconnectAttempts(0); // リセット
      }
      
      return null;
    }
  }, [reconnectAttempts]);

  // 残高を更新する関数
  const updateBalances = useCallback(async () => {
    if (!wallets || !activeWalletType || isLocked) return;
    
    try {
      const client = await getSafeClient();
      
      // クライアントが取得できなかった場合
      if (!client) {
        console.warn("残高更新: クライアント接続に失敗しました");
        return;
      }
      
      // アクティブなウォレットの残高を更新
      const activeWallet = wallets[activeWalletType];
      if (activeWallet) {
        console.log(`Updating balance for ${activeWalletType}...`);
        const updatedWallet = await updateWalletBalance(client, activeWallet);
        
        // 残高に変更があれば更新
        if (updatedWallet.balance !== activeWallet.balance) {
          console.log(`Balance updated for ${activeWalletType}: ${activeWallet.balance} -> ${updatedWallet.balance}`);
          
          // ウォレット情報を更新（アクティブなウォレットのみ）
          setWallets(prev => {
            if (!prev) return null;
            return {
              ...prev,
              [activeWalletType]: updatedWallet
            };
          });
          
          // 更新したウォレット情報を保存
          const updatedWallets = {
            ...wallets,
            [activeWalletType]: updatedWallet
          };
          saveWallets(updatedWallets);
        }
      }
      
      // 接続に成功したら再試行カウントをリセット
      if (reconnectAttempts > 0) {
        setReconnectAttempts(0);
      }
    } catch (error) {
      console.error("Failed to update balance:", error);
      // 接続エラーが継続する場合のカウントを増やす
      setReconnectAttempts(prev => prev + 1);
    }
  }, [wallets, activeWalletType, isLocked, getSafeClient, reconnectAttempts]);

  // 初期化時にローカルストレージからウォレット情報を取得
  useEffect(() => {
    const storedWallets = getWallets();
    const storedActiveWalletType = getActiveWalletType();
    
    if (storedWallets) {
      setWallets(storedWallets);
    }
    
    if (storedActiveWalletType) {
      setActiveWalletType(storedActiveWalletType);
      
      // 初期ウォレット情報もストアに設定
      if (storedWallets && storedWallets[storedActiveWalletType]) {
        finishWalletSwitch(storedWallets[storedActiveWalletType]);
      }
    }

    // 初期接続状態を確認
    checkInitialConnection();
  }, [finishWalletSwitch]);

  // アクティブなウォレットが変更されたときに残高を更新
  useEffect(() => {
    if (activeWalletType && wallets && !isLocked) {
      updateBalances();
    }
  }, [activeWalletType, updateBalances, isLocked]);

  // 定期的に残高を更新
  useEffect(() => {
    if (!activeWalletType || !wallets || isLocked) return;
    
    // 初回更新
    updateBalances();
    
    // 定期的に更新
    const intervalId = setInterval(updateBalances, BALANCE_UPDATE_INTERVAL);
    
    return () => {
      clearInterval(intervalId);
      // コンポーネントアンマウント時にクライアント接続をクリーンアップ
      disconnectClient().catch(e => console.error("切断中にエラー:", e));
    };
  }, [wallets, activeWalletType, updateBalances, isLocked]);

  // 接続状態を定期的に確認
  useEffect(() => {
    // 初期接続状態をチェック
    const initialCheck = async () => {
      const isConnected = checkConnection();
      setConnectionStatus(isConnected ? 'connected' : 'disconnected');
    };
    initialCheck();

    // XRPLのカスタムイベントをリッスン
    const handleConnected = () => {
      setConnectionStatus('connected');
      setReconnectAttempts(0); // 接続成功時にリセット
    };
    
    const handleDisconnected = () => {
      setConnectionStatus('disconnected');
    };

    window.addEventListener('xrpl-connected', handleConnected);
    window.addEventListener('xrpl-disconnected', handleDisconnected);

    return () => {
      window.removeEventListener('xrpl-connected', handleConnected);
      window.removeEventListener('xrpl-disconnected', handleDisconnected);
    };
  }, []);

  // 初期接続状態を確認する関数
  const checkInitialConnection = async () => {
    try {
      setConnectionStatus('connecting');
      const client = await getSafeClient();
      
      if (client) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      console.error("Initial connection error:", error);
      setConnectionStatus('disconnected');
    }
  };

  // ウォレットを作成する処理
  const handleCreateWallets = async () => {
    if (isLocked) return;
    
    try {
      setIsLoading(true);
      startWalletSwitch(); // 全体をロック
      setConnectionStatus('connecting');
      
      // 接続に問題がある場合は強制的に再接続
      const client = await forceReconnect().catch(async error => {
        console.error("Force reconnect failed, retrying regular connection:", error);
        const regularClient = await getClient().catch(e => {
          console.error("Regular connection also failed:", e);
          throw new Error("接続に失敗しました。ネットワーク状態を確認してください。");
        });
        return regularClient;
      });
      
      if (!client) {
        throw new Error("XRPLクライアントの初期化に失敗しました");
      }
      
      setConnectionStatus('connected');
      const newWallets = await createAllWallets(client);
      
      // ウォレット情報を保存
      setWallets(newWallets);
      saveWallets(newWallets);
      
      // デフォルトでAliceをアクティブに設定
      setActiveWalletType(WalletType.ALICE);
      saveActiveWalletType(WalletType.ALICE);
      
      // グローバルステートにウォレット情報を設定
      finishWalletSwitch(newWallets[WalletType.ALICE]);
      
      // 少し遅延を入れてからウォレット変更イベントを発火
      setTimeout(() => {
        // ウォレット変更イベントを発火
        window.dispatchEvent(new CustomEvent('wallet-changed', { 
          detail: { walletType: WalletType.ALICE } 
        }));
        console.log("ウォレット作成後、変更イベントを発火: ALICE");
      }, 500); // 0.5秒の遅延
      
      toast.success("ウォレットが作成されました");
      setReconnectAttempts(0); // 成功したらリセット
    } catch (error) {
      console.error("Failed to create wallets:", error);
      toast.error("ウォレットの作成に失敗しました");
      setConnectionStatus('disconnected');
      finishWalletSwitch(null); // エラーの場合もロック解除
    } finally {
      setIsLoading(false);
    }
  };

  // ウォレット情報をリセットする処理
  const handleResetWallets = () => {
    if (isLocked) return;
    
    setWallets(null);
    setActiveWalletType(null);
    clearWallets();
    finishWalletSwitch(null); // グローバルステートもリセット
    
    // ウォレットリセットイベントを発火
    window.dispatchEvent(new Event('wallet-reset'));
    
    toast.success("ウォレット情報がリセットされました");
  };

  // アクティブなウォレットを変更する処理
  const handleChangeWallet = async (walletType: WalletType) => {
    if (isLocked) return;
    
    try {
      setIsLoading(true);
      startWalletSwitch(); // 全体をロック
      setConnectionStatus('connecting');
      
      // 処理タイムアウト設定
      const timeoutId = setTimeout(() => {
        console.warn("ウォレット切り替え処理がタイムアウトしました");
        setIsLoading(false);
        setConnectionStatus('disconnected');
        finishWalletSwitch(null);
        toast.error("ウォレット切り替えがタイムアウトしました。再試行してください。");
      }, 30000); // 30秒でタイムアウト
      
      // ウォレットタイプを更新
      setActiveWalletType(walletType);
      saveActiveWalletType(walletType);
      
      // XRPL接続を再確立（古い状態をクリア）
      let reconnectSuccess = false;
      
      try {
        await reconnectClient();
        reconnectSuccess = true;
        setConnectionStatus('connected');
        
        // 接続成功したことを通知
        window.dispatchEvent(new CustomEvent('wallet-reconnected', { 
          detail: { walletType } 
        }));
      } catch (error) {
        console.error("Reconnect failed during wallet change, trying force reconnect:", error);
        
        try {
          await forceReconnect();
          reconnectSuccess = true;
          setConnectionStatus('connected');
          
          // 接続成功したことを通知
          window.dispatchEvent(new CustomEvent('wallet-reconnected', { 
            detail: { walletType } 
          }));
        } catch (forceError) {
          console.error("Force reconnect also failed:", forceError);
          setConnectionStatus('disconnected');
          toast.error("接続に失敗しましたが、ウォレットの切り替えは行われました");
        }
      }
      
      // グローバルステートにウォレット情報を設定
      if (wallets) {
        finishWalletSwitch(wallets[walletType]);
      }
      
      // ウォレットリセットイベントを発火
      window.dispatchEvent(new Event('wallet-reset'));
      
      // 少し遅延を入れてからウォレット変更イベントを発火（処理順序を整える）
      setTimeout(() => {
        // 最新の状態を取得するためにイベントをディスパッチ
        window.dispatchEvent(new CustomEvent('wallet-changed', { 
          detail: { walletType } 
        }));
        console.log(`ウォレット変更イベントを発火: ${walletType}`);
      }, 1000); // 1秒の遅延
      
      if (reconnectSuccess) {
        setReconnectAttempts(0); // 成功したらリセット
      }
      
      // タイムアウト解除
      clearTimeout(timeoutId);
    } catch (error) {
      console.error("Failed to change wallet:", error);
      toast.error("ウォレットの切り替えに失敗しました");
      setConnectionStatus('disconnected');
      finishWalletSwitch(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 接続の状態に応じたアイコンやテキスト
  const connectionStatusText = () => {
    if (isWalletSwitching) {
      return <span className="text-xs text-amber-600">ウォレット切り替え中...</span>;
    }
    
    switch (connectionStatus) {
      case 'connected':
        return <span className="text-xs text-green-600">接続済み</span>;
      case 'connecting':
        return <span className="text-xs text-amber-600">接続中...</span>;
      case 'disconnected':
        return <span className="text-xs text-red-600">未接続</span>;
    }
  };

  // 現在アクティブなウォレット情報を取得
  const activeWallet = activeWalletType && wallets ? wallets[activeWalletType] : null;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>ウォレット管理</CardTitle>
            <CardDescription>XRPLテストネット上のウォレットを作成・管理します</CardDescription>
          </div>
          <div>
            <ConnectionStatus />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {wallets ? (
          <div className="space-y-4">
            <WalletSelector 
              activeWalletType={activeWalletType} 
              onChange={handleChangeWallet}
              disabled={isLocked || isLoading}
            />
            
            {activeWallet && (
              <WalletInfo wallet={activeWallet} />
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="mb-4">XRPLテストネットでウォレットを作成してください</p>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <Button 
          onClick={handleCreateWallets} 
          disabled={isLoading || !!wallets || isLocked}
        >
          {isLoading ? "作成中..." : "ウォレット作成"}
        </Button>
        
        <Button 
          variant="destructive" 
          onClick={handleResetWallets}
          disabled={isLoading || !wallets || isLocked}
        >
          ウォレットリセット
        </Button>
      </CardFooter>
    </Card>
  );
} 