"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClient, reconnectClient } from "@/lib/xrpl/client";
import { WalletState } from "@/lib/xrpl/wallet";
import { getAccountNFTs, getAllNFTOffers, acceptNFTOffer } from "@/lib/xrpl/nft";
import { Wallet, NFTokenAcceptOffer, dropsToXrp } from "xrpl";
import { useAppStore } from "@/lib/store";
import { Loader } from "@/components/ui/loader";

interface NFTOffersProps {
  wallet: WalletState | null;
}

export function NFTOffers({ wallet }: NFTOffersProps) {
  const [nftOffers, setNftOffers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // 売却処理中のオファーを追跡
  const [processingSales, setProcessingSales] = useState<{[key: string]: boolean}>({});
  // 現在処理中のオファーのID（売却ボタンのローディング状態用）
  const [processingOffer, setProcessingOffer] = useState<string | null>(null);
  
  // グローバルステートを使用
  const { isLocked } = useAppStore();

  // 現在の処理中セールをref経由で参照できるようにする（依存関係を避けるため）
  const processingSalesRef = useRef<{[key: string]: boolean}>({});
  
  // フェッチ処理の重複を防ぐためのフラグ
  const isFetchingRef = useRef(false);
  
  // 最後のフェッチ時間を追跡
  const lastFetchTimeRef = useRef(0);
  
  // 前回のウォレット情報を保持するref
  const prevWalletRef = useRef<string | null>(null);
  
  // refを更新する効果
  useEffect(() => {
    processingSalesRef.current = processingSales;
  }, [processingSales]);

  // NFTオファーを取得する処理
  const fetchOffers = useCallback(async () => {
    // 既にフェッチ中なら処理をスキップ
    if (!wallet || isLocked || isFetchingRef.current) return;
    
    // 最後のフェッチから1秒以内なら処理をスキップ（デバウンス）
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 1000) {
      console.log("直前のフェッチからインターバルが短すぎるためスキップします");
      return;
    }
    
    // フェッチフラグをセット
    isFetchingRef.current = true;
    lastFetchTimeRef.current = now;
    
    console.log(`[${new Date().toLocaleTimeString()}] オファー取得を開始します - ウォレット: ${wallet.classicAddress.substring(0, 8)}...`);
    
    setIsLoading(true);
    setHasError(false);
    
    // タイムアウト処理を追加
    const timeoutId = setTimeout(() => {
      console.warn("オファー取得処理がタイムアウトしました");
      setIsLoading(false);
      setHasError(true);
      isFetchingRef.current = false;
      toast.error("オファー取得がタイムアウトしました。再試行してください。");
    }, 30000); // 30秒でタイムアウト
    
    try {
      // 接続エラーが頻発する場合は強制的に再接続
      const client = retryCount > 1 
        ? await reconnectClient() 
        : await getClient();
      
      if (!client) {
        throw new Error("XRPLクライアントの取得に失敗しました");
      }
      
      // まずアカウントのNFTを取得
      const accountNfts = await getAccountNFTs(client, wallet.classicAddress);
      console.log(`Found ${accountNfts.length} NFTs for account ${wallet.classicAddress}`);
      
      if (accountNfts.length === 0) {
        setNftOffers([]);
        clearTimeout(timeoutId);
        setIsLoading(false);
        setRetryCount(0); // 成功したらリトライカウントをリセット
        isFetchingRef.current = false;
        return;
      }
      
      // 各NFTのオファーを取得
      const allOffers = await Promise.all(
        accountNfts.map(async (nft) => {
          try {
            console.log(`Fetching offers for NFT: ${nft.NFTokenID}`);
            const { buyOffers } = await getAllNFTOffers(client, nft.NFTokenID);
            
            // オファー情報にNFT情報を追加（他者からの購入オファーのみ）
            return buyOffers.map(offer => ({
              ...offer,
              nft,
              // オファータイプを追加
              offerType: 'buy'
            }));
          } catch (error) {
            console.error(`Failed to get offers for NFT ${nft.NFTokenID}:`, error);
            return [];
          }
        })
      );
      
      // すべてのオファーを平坦化
      const flattenedOffers = allOffers.flat();
      
      // 自分が作成したオファーを除外（他者からのオファーのみ表示）
      const filteredOffers = flattenedOffers.filter(offer => 
        offer.owner !== wallet.classicAddress
      );
      
      console.log(`Found total ${filteredOffers.length} buy offers from others`);
      
      // 新しく取得したオファーのインデックスを収集
      const currentOfferIndices = new Set(filteredOffers.map(o => o.nft_offer_index));
      
      // 処理中の状態を更新（現在のオファーに含まれないものだけを削除）
      // ここでref経由で現在の状態を取得（依存関係を避けるため）
      const currentProcessingSales = { ...processingSalesRef.current };
      const updatedProcessingSales = { ...currentProcessingSales };
      
      // 処理中のオファーで、もう存在しないものだけを削除
      // （トランザクション完了直後はAPIからオファーが消えるまでにタイムラグがあるため）
      Object.keys(updatedProcessingSales).forEach(offerIndex => {
        // オファーが消えていて、かつ30秒以上経過している場合のみ削除
        // （トランザクション完了直後はAPIからオファーが消えるまでにタイムラグがあるため）
        if (!currentOfferIndices.has(offerIndex)) {
          const offerLastUpdated = localStorage.getItem(`offer_${offerIndex}_time`);
          const now = Date.now();
          if (!offerLastUpdated || (now - parseInt(offerLastUpdated)) > 30000) {
            delete updatedProcessingSales[offerIndex];
            localStorage.removeItem(`offer_${offerIndex}_time`);
          }
        }
      });
      
      // 更新された処理中状態を設定（依存関係によるループを避けるため、前の状態と比較）
      if (JSON.stringify(updatedProcessingSales) !== JSON.stringify(currentProcessingSales)) {
        setProcessingSales(updatedProcessingSales);
      }
      
      // オファーリストを更新
      setNftOffers(filteredOffers);
      setHasError(false);
      setRetryCount(0); // 成功したらリトライカウントをリセット
      
      console.log(`[${new Date().toLocaleTimeString()}] オファー取得が完了しました - 合計: ${filteredOffers.length}件`);
      
      // タイムアウト処理をクリア
      clearTimeout(timeoutId);
    } catch (error) {
      // タイムアウト処理をクリア
      clearTimeout(timeoutId);
      
      console.error("Failed to fetch NFT offers:", error);
      toast.error("NFTオファーの取得に失敗しました");
      setNftOffers([]);
      setHasError(true);
      setRetryCount(prev => prev + 1); // リトライカウントを増やす
      // エラー時には処理中状態は維持（変更しない）
    } finally {
      // タイムアウト処理をクリア (finallyでも再度クリア)
      clearTimeout(timeoutId);
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [wallet, isLocked, retryCount]); // processingSalesを依存配列から完全に除外

  // エラー状態をリセットして再試行する関数
  const handleRetry = useCallback(() => {
    setHasError(false);
    fetchOffers();
  }, [fetchOffers]);

  // ウォレットが変更されたら、オファーを再取得
  useEffect(() => {
    // isLoadingがtrueの状態が長時間続くのを防ぐセーフティタイマー
    const safetyTimerId = setTimeout(() => {
      if (isLoading) {
        console.warn("安全装置: ローディング状態が長時間続いているためリセットします");
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    }, 60000); // 60秒後に強制リセット

    // ウォレットが変わった場合のみ処理を実行
    const currentWalletAddress = wallet?.classicAddress || null;

    if (currentWalletAddress !== prevWalletRef.current) {
      console.log(`ウォレットが変更されました: ${prevWalletRef.current?.substring(0, 8) || 'なし'} -> ${currentWalletAddress?.substring(0, 8) || 'なし'}`);
      prevWalletRef.current = currentWalletAddress;

      if (wallet && !isLocked) {
        // ウォレット変更時に一定の遅延を持たせてフェッチする
        const delayMs = 1500; // 1.5秒の遅延
        console.log(`${delayMs}ms後にオファー取得を開始します`);
        
        setTimeout(() => {
          // フェッチ前に状態をリセット
          isFetchingRef.current = false; 
          fetchOffers();
        }, delayMs);
      } else {
        setNftOffers([]);
        setHasError(false);
        setRetryCount(0);
        setProcessingSales({});
        setIsLoading(false); // 明示的にロード状態をリセット
        isFetchingRef.current = false;
        // ローカルストレージからもクリア
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('offer_') && key.endsWith('_time')) {
            localStorage.removeItem(key);
          }
        });
      }
    }
    
    return () => {
      clearTimeout(safetyTimerId);
    };
  }, [wallet, isLocked, fetchOffers]); // isLoadingを依存配列から削除

  // ウォレットリセットイベントをリッスン
  useEffect(() => {
    const handleWalletReset = () => {
      console.log("ウォレットリセットイベントを受信: オファーリストを更新します");
      // ロード状態をリセットしてから処理を開始
      setIsLoading(false);
      isFetchingRef.current = false;
      
      if (wallet && !isLocked) {
        setRetryCount(0); // リセット時にリトライカウントをリセット
        // 少し遅延を入れてからフェッチを実行（他のコンポーネントの処理と衝突を避ける）
        const delayMs = 2000; // 2秒の遅延
        console.log(`ウォレットリセット後、${delayMs}ms後にオファー取得を開始します`);
        
        setTimeout(() => {
          if (!isFetchingRef.current) {
            fetchOffers();
          } else {
            console.log("既に取得処理が実行中のため、スキップします");
          }
        }, delayMs);
      }
    };

    window.addEventListener('wallet-reset', handleWalletReset);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-reset', handleWalletReset);
    };
  }, [wallet, isLocked, fetchOffers]);

  // ウォレット変更イベントをリッスン
  useEffect(() => {
    const handleWalletChanged = () => {
      console.log("ウォレット変更イベントを受信: オファーリストを更新します");
      // ロード状態をリセットしてから処理を開始
      setIsLoading(false);
      isFetchingRef.current = false;
      
      if (wallet && !isLocked) {
        setRetryCount(0); // 変更時にリトライカウントをリセット
        // 少し遅延を入れてからフェッチを実行（他のコンポーネントの処理と衝突を避ける）
        const delayMs = 2000; // 2秒の遅延
        console.log(`ウォレット変更後、${delayMs}ms後にオファー取得を開始します`);
        
        setTimeout(() => {
          if (!isFetchingRef.current) {
            fetchOffers();
          } else {
            console.log("既に取得処理が実行中のため、スキップします");
          }
        }, delayMs);
      }
    };

    window.addEventListener('wallet-changed', handleWalletChanged);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-changed', handleWalletChanged);
    };
  }, [wallet, isLocked, fetchOffers]);

  // XRPL接続イベントをリッスン
  useEffect(() => {
    const handleXrplConnected = () => {
      console.log("XRPL接続イベントを受信: オファーリストを更新します");
      // ロード状態をリセット
      setIsLoading(false);
      isFetchingRef.current = false;
      
      if (wallet && !isLocked && hasError) {
        // 接続が復活したときにエラー状態なら再試行
        // 少し遅延を入れてから実行
        const delayMs = 2500; // 2.5秒の遅延
        console.log(`XRPL接続後、${delayMs}ms後にオファー取得を開始します`);
        
        setTimeout(() => {
          if (!isFetchingRef.current) {
            handleRetry();
          } else {
            console.log("既に取得処理が実行中のため、スキップします");
          }
        }, delayMs);
      }
    };

    window.addEventListener('xrpl-connected', handleXrplConnected);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('xrpl-connected', handleXrplConnected);
    };
  }, [wallet, isLocked, hasError, handleRetry]);

  // オファーを承認する処理
  const handleAcceptOffer = async (offerIndex: string) => {
    if (!wallet) {
      toast.error("ウォレットが選択されていません");
      return;
    }
    
    // 既に処理中なら二重実行を防止
    if (processingOffer || isFetchingRef.current) {
      console.log("既に処理中のため、オファー承認をスキップします");
      return;
    }
    
    try {
      // 処理中のオファーIDをセット
      setProcessingOffer(offerIndex);
      isFetchingRef.current = true;
      
      // 処理タイムアウト設定
      const timeoutId = setTimeout(() => {
        console.warn("オファー承認処理がタイムアウトしました");
        setProcessingOffer(null);
        isFetchingRef.current = false;
        toast.error("処理がタイムアウトしました。後ほど再試行してください。");
      }, 30000); // 30秒でタイムアウト
      
      // 処理中のオファーを追跡（依存関係を避けるためrefから取得）
      const updatedProcessingSales = { 
        ...processingSalesRef.current, 
        [offerIndex]: true 
      };
      setProcessingSales(updatedProcessingSales);
      
      // ローカルストレージに処理開始時間を保存
      localStorage.setItem(`offer_${offerIndex}_time`, Date.now().toString());
      
      const client = await getClient();
      
      // バイオファーを承認する場合は、NFTokenBuyOfferパラメータを使用
      const transactionBlob: NFTokenAcceptOffer = {
        TransactionType: "NFTokenAcceptOffer",
        Account: wallet.classicAddress,
        NFTokenBuyOffer: offerIndex,
      };
      
      // オファー承認
      const wallet_xrpl = wallet.seed ? Wallet.fromSeed(wallet.seed) : null;
      if (!wallet_xrpl) {
        throw new Error("ウォレットの初期化に失敗しました");
      }
      
      await client.submitAndWait(transactionBlob, { wallet: wallet_xrpl });
      
      // タイムアウト処理をクリア
      clearTimeout(timeoutId);
      
      toast.success("購入オファーを承認しました");
      setRetryCount(0);
      
      // 売却が成功した場合でも、すぐにはオファーリストから消えない可能性があるため、
      // 処理中状態は維持したまま、データの再取得だけ行う
      // 一定時間待ってからデータを再取得（XRPLの処理待ち）
      setTimeout(() => {
        isFetchingRef.current = false; // フェッチフラグをリセット
        setProcessingOffer(null); // 処理中オファーをリセット
        fetchOffers();
      }, 1500);
    } catch (error) {
      console.error("Failed to accept offer:", error);
      toast.error("オファーの承認に失敗しました");
      // エラー時に処理中状態を解除（依存関係を避けるためrefから取得）
      const updatedProcessingSales = { ...processingSalesRef.current };
      delete updatedProcessingSales[offerIndex];
      setProcessingSales(updatedProcessingSales);
      
      // ローカルストレージからも削除
      localStorage.removeItem(`offer_${offerIndex}_time`);
      setProcessingOffer(null);
      isFetchingRef.current = false;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>NFT購入オファー</CardTitle>
            <CardDescription>あなたのNFTに対する購入オファー一覧</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isLoading || !wallet || isLocked}
          >
            更新
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <p>オファーを取得中...</p>
          </div>
        ) : isLocked ? (
          <div className="text-center py-8">
            <p>ウォレット切り替え中...</p>
            <p className="text-sm text-gray-500 mt-2">
              処理が完了するまでお待ちください
            </p>
          </div>
        ) : nftOffers.length > 0 ? (
          <div className="space-y-4">
            {nftOffers.map((offer) => (
              <div
                key={offer.nft_offer_index}
                className="p-4 border rounded-md flex justify-between items-center"
              >
                <div>
                  <p className="font-medium">
                    {dropsToXrp(offer.amount)} XRP
                  </p>
                  <p className="text-sm text-gray-500">
                    オファーID: {offer.nft_offer_index.substring(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    NFT ID: <a href={`https://testnet.xrpl.org/nft/${offer.nft.NFTokenID}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">{offer.nft.NFTokenID.substring(0, 8)}...</a>
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    <span className="bg-green-100 px-1 py-0.5 rounded">購入オファー</span>
                  </p>
                </div>
                {processingSales[offer.nft_offer_index] ? (
                  <Button
                    size="sm"
                    disabled={true}
                    className="bg-amber-50 text-amber-800 border border-amber-200"
                  >
                    売却中...
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleAcceptOffer(offer.nft_offer_index)}
                    disabled={processingOffer !== null}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processingOffer === offer.nft_offer_index ? (
                      <span className="flex items-center gap-2">
                        <Loader size="sm" color="white" />
                        処理中
                      </span>
                    ) : (
                      "売却する"
                    )}
                  </Button>
                )}
              </div>
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
                {retryCount > 2 && (
                  <p className="text-xs text-red-500 mt-1">
                    繰り返しエラーが発生しています。ネットワーク接続をご確認ください
                  </p>
                )}
              </>
            ) : (
              <>
                <p>現在、購入オファーはありません</p>
                <p className="text-sm text-gray-500 mt-2">
                  他のユーザーがあなたのNFTに対して購入オファーを出すと、ここに表示されます
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 