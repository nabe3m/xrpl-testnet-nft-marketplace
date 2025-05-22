"use client";

import { useState, useEffect } from "react";
import { WalletManager } from "@/components/wallet/WalletManager";
import { NFTMinter } from "@/components/nft/NFTMinter";
import { NFTList } from "@/components/nft/NFTList";
import { NFTOffers } from "@/components/nft/NFTOffers";
import { NFTMarketplace } from "@/components/nft/NFTMarketplace";
import { WalletState, WalletType } from "@/lib/xrpl/wallet";
import { getWallets, getActiveWalletType } from "@/lib/storage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getClient, forceReconnect } from "@/lib/xrpl/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";

export default function Home() {
  const [wallets, setWallets] = useState<Record<WalletType, WalletState> | null>(null);
  const [activeWalletType, setActiveWalletType] = useState<WalletType | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // 更新用のキー
  const [isConnectionError, setIsConnectionError] = useState(false);
  
  // 初期化時にローカルストレージからウォレット情報を取得
  useEffect(() => {
    const storedWallets = getWallets();
    const storedActiveWalletType = getActiveWalletType();
    
    if (storedWallets) {
      setWallets(storedWallets);
    }
    
    if (storedActiveWalletType) {
      setActiveWalletType(storedActiveWalletType);
    }
  }, []);
  
  // ウォレット切り替えイベントのリスナーを設定
  useEffect(() => {
    const handleWalletChange = (event: Event) => {
      // イベントデータを取得
      const customEvent = event as CustomEvent;
      const hasError = customEvent.detail?.error;
      
      // 最新のウォレット情報を取得
      const updatedWallets = getWallets();
      const updatedActiveWalletType = getActiveWalletType();
      
      if (updatedWallets) {
        setWallets(updatedWallets);
      }
      
      if (updatedActiveWalletType) {
        setActiveWalletType(updatedActiveWalletType);
      }
      
      // 接続エラーフラグを設定
      setIsConnectionError(!!hasError);
      
      // 少し遅延を入れてから更新キーを変更（コンポーネントの再レンダリングを強制）
      setTimeout(() => {
        console.log("遅延後にコンポーネント更新をトリガーします");
        setRefreshKey(prevKey => prevKey + 1);
      }, 500); // 0.5秒の遅延
    };
    
    // カスタムイベントリスナーを追加
    window.addEventListener('wallet-changed', handleWalletChange);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-changed', handleWalletChange);
    };
  }, []);
  
  // 接続を強制的に再試行する
  const handleRetryConnection = async () => {
    try {
      toast.loading("接続を再試行しています...");
      await forceReconnect();
      setIsConnectionError(false);
      toast.success("接続が回復しました");
      
      // 接続回復を通知するためのイベントをディスパッチ
      window.dispatchEvent(new CustomEvent('wallet-reconnected', {
        detail: { walletType: activeWalletType }
      }));
      
      // コンポーネントを更新
      setRefreshKey(prevKey => prevKey + 1);
    } catch (error) {
      console.error("Connection retry failed:", error);
      toast.error("接続の再試行に失敗しました");
    }
  };
  
  // 現在アクティブなウォレット情報を取得
  const activeWallet = activeWalletType && wallets ? wallets[activeWalletType] : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto py-8 px-4">
        {isConnectionError && (
          <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <h3 className="font-medium text-yellow-800 mb-2">WebSocket接続エラー</h3>
            <p className="text-sm text-yellow-700 mb-4">
              XRPLネットワークとの接続に問題が発生しています。アプリケーションの一部機能が利用できない可能性があります。
            </p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRetryConnection}
            >
              接続を再試行
            </Button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <WalletManager />
          </div>
          
          <div>
            <NFTMinter key={`minter-${refreshKey}`} wallet={activeWallet} />
          </div>
        </div>
        
        <Tabs defaultValue="my-nfts" className="mb-8">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="my-nfts">保有NFT</TabsTrigger>
            <TabsTrigger value="marketplace">マーケットプレイス</TabsTrigger>
            <TabsTrigger value="offers">受信オファー</TabsTrigger>
          </TabsList>
          
          <TabsContent value="my-nfts" className="mt-4">
            <NFTList key={`list-${refreshKey}`} wallet={activeWallet} />
          </TabsContent>
          
          <TabsContent value="marketplace" className="mt-4">
            <NFTMarketplace key={`marketplace-${refreshKey}`} wallet={activeWallet} />
          </TabsContent>
          
          <TabsContent value="offers" className="mt-4">
            <NFTOffers key={`offers-${refreshKey}`} wallet={activeWallet} />
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
    </main>
  );
}
