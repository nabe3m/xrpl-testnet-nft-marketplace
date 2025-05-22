"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/xrpl/client";
import { getAccountNFTs } from "@/lib/xrpl/nft";
import { NFTItem } from "./NFTItem";
import { NFT, ComponentWithWallet } from "@/lib/types";
import { useAppStore } from "@/lib/store";

interface NFTListProps extends ComponentWithWallet {}

export function NFTList({ wallet }: NFTListProps) {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  // グローバルステートを使用
  const { isLocked } = useAppStore();

  // NFTを取得する処理 - useCallbackでメモ化
  const fetchNFTs = useCallback(async () => {
    if (!wallet || isLocked) return;
    
    setIsLoading(true);
    setHasError(false);
    
    try {
      const client = await getClient();
      const accountNfts = await getAccountNFTs(client, wallet.classicAddress);
      console.log(accountNfts);
      
      // 各NFTにオーナー情報を追加
      const nftsWithOwner = accountNfts.map(nft => ({
        ...nft,
        Owner: wallet.classicAddress // 現在のウォレットが所有者
      }));
      
      setNfts(nftsWithOwner);
      setHasError(false);
    } catch (error) {
      console.error("Failed to fetch NFTs:", error);
      toast.error("NFTの取得に失敗しました");
      setNfts([]);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, isLocked]); // 依存配列を追加

  // ウォレットが変更されたら、NFTを再取得
  useEffect(() => {
    if (wallet && !isLocked) {
      fetchNFTs();
    } else {
      setNfts([]);
      setHasError(false);
    }
  }, [wallet, isLocked, fetchNFTs]);

  // ウォレットリセットイベントをリッスン
  useEffect(() => {
    const handleWalletReset = () => {
      console.log("ウォレットリセットイベントを受信: 所有NFTリストを更新します");
      if (wallet && !isLocked) {
        fetchNFTs();
      }
    };

    window.addEventListener('wallet-reset', handleWalletReset);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-reset', handleWalletReset);
    };
  }, [wallet, isLocked, fetchNFTs]);

  // ウォレット変更イベントをリッスン
  useEffect(() => {
    const handleWalletChanged = () => {
      console.log("ウォレット変更イベントを受信: 所有NFTリストを更新します");
      if (wallet && !isLocked) {
        // 少し遅延を入れてからフェッチを実行（他のコンポーネントの処理と衝突を避ける）
        setTimeout(() => {
          console.log("遅延後にNFTリストを更新します");
          fetchNFTs();
        }, 2000); // 2秒の遅延
      }
    };

    window.addEventListener('wallet-changed', handleWalletChanged);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-changed', handleWalletChanged);
    };
  }, [wallet, isLocked, fetchNFTs]);

  // NFT発行イベントを監視して自動的にリスト更新
  useEffect(() => {
    // NFT発行完了イベントをリッスン
    const handleNFTMinted = () => {
      if (isLocked) return; // ロック中は更新しない
      
      console.log("NFT発行イベントを受信: 所有NFTリストを更新します");
      fetchNFTs();
    };

    window.addEventListener('nft-minted', handleNFTMinted);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('nft-minted', handleNFTMinted);
    };
  }, [wallet, isLocked, fetchNFTs]); // walletが変わったらリスナーを再設定

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>保有NFT</CardTitle>
            <CardDescription>所有するNFTを販売することができます</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNFTs}
            disabled={isLoading || !wallet || isLocked}
          >
            更新
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <p>NFTを取得中...</p>
          </div>
        ) : isLocked ? (
          <div className="text-center py-8">
            <p>ウォレット切り替え中...</p>
            <p className="text-sm text-gray-500 mt-2">
              処理が完了するまでお待ちください
            </p>
          </div>
        ) : nfts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {nfts.map((nft) => (
              <NFTItem 
                key={nft.NFTokenID} 
                nft={nft} 
                wallet={wallet} 
                onUpdate={fetchNFTs} 
                isOwnedList={true}
                disabled={isLocked} 
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            {hasError ? (
              <>
                <p>データの取得中にエラーが発生しました</p>
                <p className="text-sm text-gray-500 mt-2">
                  更新ボタンを押して再度試してください
                </p>
              </>
            ) : (
              <>
                <p>販売可能なNFTがありません</p>
                {wallet && (
                  <p className="text-sm text-gray-500 mt-2">
                    NFTを発行するか、他のユーザーからNFTを購入してから販売できます
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
      
      {/* NFTフラグの説明 */}
      <div className="px-6 py-4 border-t border-gray-100">
        <p className="text-sm font-medium mb-2">NFTフラグについて:</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">焼却可能</span>
            <p className="text-xs text-gray-600">所有者によりNFTの焼却（破棄）が可能です</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">転送不可</span>
            <p className="text-xs text-gray-600">このNFTは転送できません</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">XRPのみ</span>
            <p className="text-xs text-gray-600">取引にはXRPのみが使用できます</p>
          </div>
        </div>
      </div>
    </Card>
  );
} 