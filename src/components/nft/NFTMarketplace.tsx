"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/xrpl/client";
import { WalletState, WalletType } from "@/lib/xrpl/wallet";
import { getAccountNFTs, getAllNFTOffers } from "@/lib/xrpl/nft";
import { getWallets } from "@/lib/storage";
import { NFTItem } from "./NFTItem";
import { useAppStore } from "@/lib/store";
import { NFTOffer } from "@/lib/types";
import { dropsToXrp } from "xrpl";

interface NFTMarketplaceProps {
  wallet: WalletState | null;
}

interface NFTForSale {
  NFTokenID: string;
  Issuer: string;
  Owner: string;
  URI?: string;
  Flags?: number;
  offerAmount: string;
  offerID: string;
  walletType?: WalletType;
  metadata?: {
    name: string;
    description: string;
    image: string;
    [key: string]: any;
  };
}

export function NFTMarketplace({ wallet }: NFTMarketplaceProps) {
  const [marketItems, setMarketItems] = useState<NFTForSale[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  // 自分の買いオファーを保持する状態
  const [myBuyOffers, setMyBuyOffers] = useState<{[key: string]: NFTOffer}>({});
  
  // グローバルステートを使用
  const { isLocked } = useAppStore();

  // 販売中のNFTを取得する処理
  // useCallbackを使用して関数をメモ化
  const fetchMarketItems = useCallback(async () => {
    if (!wallet || isLocked) return;
    
    setIsLoading(true);
    setHasError(false);
    
    try {
      // ローカルストレージからすべてのウォレット情報を取得
      const storedWallets = getWallets();
      if (!storedWallets) {
        toast.error("ウォレット情報が見つかりません");
        setIsLoading(false);
        setHasError(true);
        return;
      }
      
      // XRPLクライアントを取得
      const client = await getClient();
      
      // すべてのテストアカウント（自分以外）のNFTを取得
      const allWalletTypes = Object.values(WalletType).filter(type => type !== wallet.type);
      
      // 各アカウントのNFTを取得（並列処理）
      const otherAccountsNfts = await Promise.all(
        allWalletTypes.map(async (walletType) => {
          const accountWallet = storedWallets[walletType];
          if (!accountWallet) return [];
          
          try {
            console.log(`Fetching NFTs for ${walletType} (${accountWallet.classicAddress})`);
            const nfts = await getAccountNFTs(client, accountWallet.classicAddress);

            console.log(nfts);
            
            // 各NFTに対して実際のオファー情報とメタデータを取得
            const nftsWithOffers = await Promise.all(
              nfts.map(async (nft) => {
                try {
                  // オファー情報を取得
                  const { sellOffers } = await getAllNFTOffers(client, nft.NFTokenID);
                  
                  // メタデータを解析
                  const metadata = parseMetadata(nft.URI);

                  console.log(metadata);
                  
                  // 最も安い有効なオファーを検索
                  const validOffer = sellOffers && sellOffers.length > 0 
                    ? sellOffers.sort((a, b) => parseInt(a.amount) - parseInt(b.amount))[0] 
                    : null;
                  
                  return {
                    ...nft,
                    walletType,
                    ownerAddress: accountWallet.classicAddress,
                    offerAmount: validOffer ? validOffer.amount : "",
                    offerID: validOffer ? validOffer.nft_offer_index : "",
                    hasValidOffer: !!validOffer,
                    metadata
                  };
                } catch (error) {
                  console.error(`Failed to get offer info for NFT ${nft.NFTokenID}:`, error);
                  return null;
                }
              })
            );
            
            // nullを除外
            return nftsWithOffers.filter(nft => nft !== null);
          } catch (error) {
            console.error(`Failed to fetch NFTs for ${walletType}:`, error);
            return [];
          }
        })
      );
      
      // 結果を平坦化して1つの配列にする
      const combinedNfts = otherAccountsNfts.flat();
      console.log(`合計 ${combinedNfts.length} 個のNFTを取得しました`);
      
      // NFTForSale形式に変換
      const marketItems: NFTForSale[] = combinedNfts.map(nft => ({
        NFTokenID: nft.NFTokenID,
        Issuer: nft.Issuer,
        Owner: nft.ownerAddress,
        URI: nft.URI,
        Flags: nft.Flags,
        offerAmount: nft.offerAmount,
        offerID: nft.offerID,
        walletType: nft.walletType,
        metadata: nft.metadata
      }));
      
      // 自分の買いオファー情報を取得
      try {
        // 現在のウォレットの買いオファーを取得
        const myOffers = await client.request({
          command: "account_nfts",
          account: wallet.classicAddress,
          ledger_index: "validated"
        });
        
        console.log("自分のNFT情報:", myOffers);
        
        // 各NFTの買いオファー情報を取得
        const myBuyOffersMap: {[key: string]: NFTOffer} = {};
        
        // マーケットプレイスの各NFTに対して自分の買いオファーを確認
        await Promise.all(marketItems.map(async (nft) => {
          try {
            const { buyOffers } = await getAllNFTOffers(client, nft.NFTokenID);
            
            // 自分が作成した買いオファーを検索
            const myOffer = buyOffers.find(offer => offer.owner === wallet.classicAddress);
            
            if (myOffer) {
              console.log(`NFT ${nft.NFTokenID} に対する自分の買いオファーを発見:`, myOffer);
              myBuyOffersMap[nft.NFTokenID] = {
                offerID: myOffer.nft_offer_index,
                amount: myOffer.amount,
                owner: myOffer.owner,
                isSellOffer: false,
                nftokenID: nft.NFTokenID
              };
            }
          } catch (error) {
            console.error(`NFT ${nft.NFTokenID} の買いオファー取得エラー:`, error);
          }
        }));
        
        // 買いオファー情報を更新
        setMyBuyOffers(myBuyOffersMap);
        console.log("自分の買いオファー情報を更新:", myBuyOffersMap);
      } catch (error) {
        console.error("自分の買いオファー情報の取得に失敗:", error);
      }
      
      setMarketItems(marketItems);
      setHasError(false);
    } catch (error) {
      console.error("マーケットアイテムの取得に失敗:", error);
      toast.error("販売中のNFT情報の取得に失敗しました");
      setMarketItems([]);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, isLocked]); // 依存配列を追加

  // ウォレットが変更されたら、マーケットアイテムを再取得
  useEffect(() => {
    if (wallet && !isLocked) {
      fetchMarketItems();
    } else {
      setMarketItems([]);
      setHasError(false);
    }
  }, [wallet, isLocked, fetchMarketItems]);

  // ウォレットリセットイベントをリッスン
  useEffect(() => {
    const handleWalletReset = () => {
      console.log("ウォレットリセットイベントを受信: マーケットリストを更新します");
      if (wallet && !isLocked) {
        fetchMarketItems();
      }
    };

    window.addEventListener('wallet-reset', handleWalletReset);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-reset', handleWalletReset);
    };
  }, [wallet, isLocked, fetchMarketItems]);

  // ウォレット変更イベントをリッスン
  useEffect(() => {
    const handleWalletChanged = () => {
      console.log("ウォレット変更イベントを受信: マーケットリストを更新します");
      if (wallet && !isLocked) {
        fetchMarketItems();
      }
    };

    window.addEventListener('wallet-changed', handleWalletChanged);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('wallet-changed', handleWalletChanged);
    };
  }, [wallet, isLocked, fetchMarketItems]);

  // NFT発行イベントを監視して自動的にリスト更新
  useEffect(() => {
    // NFT発行完了イベントをリッスン
    const handleNFTMinted = () => {
      if (isLocked) return; // ロック中は更新しない
      
      console.log("NFT発行イベントを受信: マーケットリストを更新します");
      fetchMarketItems();
    };

    window.addEventListener('nft-minted', handleNFTMinted);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('nft-minted', handleNFTMinted);
    };
  }, [wallet, isLocked, fetchMarketItems]); // walletが変わったらリスナーを再設定

  // URIからメタデータを解析する関数
  const parseMetadata = (uri?: string) => {
    if (!uri) return { name: "Unknown NFT", description: "No description", image: "" };
    
    try {
      // 16進数URIをデコード
      const hex = uri;
      let str = "";
      for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      
      // Vercel Blob URLの場合、実際にフェッチして取得する
      if (str.includes('blob.vercel-storage.com')) {
        try {
          // 非同期処理はここでは行わず、URLをそのまま返してNFTItemコンポーネントに委ねる
          return { 
            name: "Vercel Blob NFT", 
            description: "Metadata stored on Vercel Blob",
            image: "" // 画像URLはメタデータから取得する
          };
        } catch (error) {
          console.error("Failed to handle Vercel Blob metadata:", error);
        }
      }
      
      // 相対パスURLかdata:URLかを確認
      if (str.startsWith('/metadata/')) {
        try {
          // 実際にメタデータをフェッチする（通常はサーバーサイドで行うべき操作）
          // ここでは簡易的なデータを返す
          return { 
            name: "Local NFT", 
            description: "This NFT is stored locally",
            image: str.replace('/metadata/', '/images/').replace('.json', '.jpg')
          };
        } catch (error) {
          console.error("Failed to fetch local metadata:", error);
        }
      }
      
      // data:URLからBase64部分を抽出
      const base64Match = str.match(/^data:application\/json;base64,(.+)$/);
      if (base64Match) {
        const jsonStr = atob(base64Match[1]);
        return JSON.parse(jsonStr);
      }
      
      // その他のケース
      return { 
        name: "NFT", 
        description: "No readable metadata",
        image: "" 
      };
    } catch (error) {
      console.error("Failed to parse metadata:", error);
      return { 
        name: "NFT", 
        description: "Error parsing metadata",
        image: "" 
      };
    }
  };

  // 金額をフォーマット（XRPの6桁精度を考慮）
  const formatAmount = (amount: string) => {
    const num = parseInt(amount, 10) / 1000000;
    return num.toString();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>NFTマーケットプレイス</CardTitle>
            <CardDescription>販売中のNFT一覧</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMarketItems}
            disabled={isLoading || !wallet || isLocked}
          >
            更新
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <p>販売中のNFTを取得中...</p>
          </div>
        ) : isLocked ? (
          <div className="text-center py-8">
            <p>ウォレット切り替え中...</p>
            <p className="text-sm text-gray-500 mt-2">
              処理が完了するまでお待ちください
            </p>
          </div>
        ) : marketItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {marketItems.map((item) => (
              <div key={item.NFTokenID} className="w-full flex flex-col">
                <NFTItem
                  nft={item}
                  wallet={wallet}
                  onUpdate={fetchMarketItems}
                  offerAmount={item.offerAmount}
                  offerID={item.offerID}
                  myBuyOffer={myBuyOffers[item.NFTokenID]}
                  disabled={isLocked}
                />
                {/* 価格表示を追加 */}
                <div className="bg-white border-t border-gray-100 rounded-b-lg p-2 text-center">
                  {/* 自分の買いオファーがある場合に表示 */}
                  {myBuyOffers[item.NFTokenID] && (
                    <div className="mb-2 text-xs bg-blue-50 p-2 rounded-md flex flex-col">
                      <p className="font-medium text-blue-600">あなたの買いオファー</p>
                      <p className="text-blue-600">{dropsToXrp(myBuyOffers[item.NFTokenID].amount).toString().replace(/\.?0+$/, '')} XRP</p>
                      <p className="text-gray-500 text-xs mt-1">オファーID: {myBuyOffers[item.NFTokenID].offerID.substring(0, 8)}...</p>
                    </div>
                  )}
                  {item.offerAmount ? (
                    <p className="text-sm font-medium text-green-600 line-clamp-1">
                      価格: {formatAmount(item.offerAmount)} XRP
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-gray-600 line-clamp-1">
                      販売中ではありません
                    </p>
                  )}
                  <p className="text-xs text-gray-400 truncate">
                    所有者: {item.walletType ? item.walletType : (
                      <a href={`https://testnet.xrpl.org/accounts/${item.Owner}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">
                        {getAccountName(item.Owner)}
                      </a>
                    )}
                  </p>
                </div>
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
              </>
            ) : (
              <>
                <p>販売中のNFTはありません</p>
                {wallet && (
                  <p className="text-sm text-gray-500 mt-2">
                    マーケットが空です。戻って確認するか、NFTの発行と出品を行ってください
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// アドレスからアカウント名を取得するヘルパー関数
function getAccountName(address: string): string {
  const wallets = getWallets();
  if (!wallets) return address.substring(0, 8) + '...';
  
  for (const type of Object.values(WalletType)) {
    if (wallets[type].classicAddress === address) {
      return type;
    }
  }
  
  return address.substring(0, 8) + '...';
} 