"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getClient } from "@/lib/xrpl/client";
import { WalletState, WalletType } from "@/lib/xrpl/wallet";
import { burnNFT, createNFTOffer, acceptNFTOffer } from "@/lib/xrpl/nft";
import { xrpToDrops, dropsToXrp } from "xrpl";
import { NFT, NFTMetadata, NFTOffer } from "@/lib/types";
import { Loader } from "@/components/ui/loader";

export interface NFTItemProps {
  nft: NFT;
  wallet: WalletState | null;
  onUpdate?: () => void;
  // 既存の売りオファー情報
  offerAmount?: string;
  offerID?: string;
  // またはNFTOffer型で渡すことも可能
  offer?: NFTOffer;
  // 自分の買いオファー情報
  myBuyOffer?: NFTOffer;
  // 自分のNFTリストに表示される場合はtrue
  isOwnedList?: boolean;
  disabled?: boolean;
}

export function NFTItem({ nft, wallet, onUpdate, offerAmount, offerID, offer, myBuyOffer, isOwnedList = false, disabled = false }: NFTItemProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sellAmount, setSellAmount] = useState("");
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null);
  // 画像読み込みエラーを追跡する状態を追加
  const [imageError, setImageError] = useState(false);

  // デバッグ出力
  useEffect(() => {
    console.log("NFT詳細:", nft);
  }, [nft]);

  // クリーンアップ処理
  useEffect(() => {
    return () => {
      // コンポーネントのアンマウント時の処理（不要になったため空にする）
    };
  }, []);

  // フラグの解析
  // tfFlagsまたはFlagsを確認（XRPLのバージョンによって異なる可能性があります）
  const flags = nft.Flags || nft.tfFlags || 0;
  const isBurnable = (flags & 1) === 1;       // lsfBurnable
  const isOnlyXRP = (flags & 2) === 2;        // lsfOnlyXRP
  const isTrustLine = (flags & 4) === 4;      // lsfTrustLine
  const isTransferable = (flags & 8) === 8;   // lsfTransferable

  // Issuer自身がフラグを持っている場合もある
  useEffect(() => {
    // フラグのデバッグ
    console.log("NFTフラグ情報:", {
      flags,
      isBurnable,
      isOnlyXRP,
      isTrustLine,
      isTransferable
    });
  }, [flags, isBurnable, isOnlyXRP, isTrustLine, isTransferable]);

  // offerオブジェクトから情報を抽出（優先的に使用）
  const effectiveOfferID = offer?.offerID || offerID;
  const effectiveOfferAmount = offer?.amount || offerAmount;
  
  // 売りオファーが存在するかどうかの判定
  const hasSellOffer = !!effectiveOfferID && !!effectiveOfferAmount;

  // XRPドロップス（6桁精度）から表示用のXRP金額に変換
  const formatAmountFromDrops = (drops: string) => {
    // xrpl.jsのdropsToXrp関数を使用して、文字列に変換してから不要な0を削除
    return dropsToXrp(drops).toString().replace(/\.?0+$/, '');
  };

  const [buyAmount, setBuyAmount] = useState(effectiveOfferAmount ? formatAmountFromDrops(effectiveOfferAmount) : "");
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);

  // URIからメタデータを解析
  const getMetadata = () => {
    try {
      if (!nft.URI) return null;
      
      // 16進数URIをデコード
      const hex = nft.URI;
      let str = "";
      for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      
      // Vercel Blob URLの場合
      if (str.includes('blob.vercel-storage.com')) {
        return { url: str, isExternalUrl: true };
      }
      
      // 相対パスURLかdata:URLかを確認
      if (str.startsWith('/metadata/')) {
        return { url: str, isLocalUrl: true };
      }
      
      // data:URLからBase64部分を抽出
      const base64Match = str.match(/^data:application\/json;base64,(.+)$/);
      if (!base64Match) return null;
      
      // Base64デコード
      const jsonStr = atob(base64Match[1]);
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("Failed to parse NFT metadata:", error);
      return null;
    }
  };

  // メタデータの取得
  useEffect(() => {
    const metadata = getMetadata();
    
    // URLの場合、実際にフェッチする
    if (metadata && (metadata.isLocalUrl || metadata.isExternalUrl)) {
      const fetchData = async () => {
        try {
          const response = await fetch(metadata.url);
          if (response.ok) {
            const data = await response.json();
            setMetadata(data);
          } else {
            console.error("メタデータの取得に失敗:", response.status);
            setMetadata({
              name: nft.NFTokenID.substring(0, 8) + '...',
              description: 'メタデータを取得できませんでした',
              image: null
            });
          }
        } catch (error) {
          console.error("メタデータのフェッチエラー:", error);
          setMetadata({
            name: nft.NFTokenID.substring(0, 8) + '...',
            description: 'メタデータのフェッチエラー',
            image: null
          });
        }
      };
      
      fetchData();
    } else {
      // 直接パースされたメタデータの場合
      setMetadata(metadata);
    }
    // nft.URIに依存し、nft.NFTokenIDは依存関係から除外
  }, [nft.URI]);

  // NFTを売りに出す処理
  const handleSellNFT = async () => {
    if (!wallet) {
      toast.error("ウォレットが選択されていません");
      return;
    }
    
    // 数値チェック
    const numericAmount = parseFloat(sellAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("有効な販売金額を入力してください");
      return;
    }
    
    try {
      setIsLoading(true);
      // 処理状態の保存は不要になったため削除
      setSellDialogOpen(false); // ダイアログを閉じる
      
      const client = await getClient();
      
      // オファー作成
      await createNFTOffer(
        client,
        wallet,
        nft.NFTokenID,
        xrpToDrops(sellAmount), // XRPからドロップスに変換
        true // 売りオファー
      );
      
      toast.success("NFTを売りに出しました");
      onUpdate?.(); // リストを更新して最新の売りオファー情報を反映
    } catch (error) {
      console.error("Failed to sell NFT:", error);
      toast.error("NFTの出品に失敗しました");
      // エラー時の処理状態解除も不要になったため削除
    } finally {
      setIsLoading(false);
    }
  };

  // NFTを焼却する処理
  const handleBurnNFT = async () => {
    if (!wallet) {
      toast.error("ウォレットが選択されていません");
      return;
    }
    
    try {
      setIsLoading(true);
      const client = await getClient();
      
      // NFT焼却
      await burnNFT(client, wallet, nft.NFTokenID);
      
      toast.success("NFTを焼却しました");
      onUpdate?.();
    } catch (error) {
      console.error("Failed to burn NFT:", error);
      toast.error("NFTの焼却に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // NFTを買うオファーを作成する処理
  const handleBuyNFT = async () => {
    if (!wallet) {
      toast.error("ウォレットが選択されていません");
      return;
    }
    
    // 数値チェック
    const numericAmount = parseFloat(buyAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("有効な金額を入力してください");
      return;
    }
    
    // NFTの所有者情報を確認
    if (!nft.Owner) {
      toast.error("NFTの所有者情報がありません。更新ボタンを押してみてください。");
      console.error("NFT所有者情報がありません:", nft);
      return;
    }
    
    if (isOwner()) {
      toast.error("自分のNFTに対して買いオファーは作成できません");
      return;
    }
    
    try {
      setIsLoading(true);
      setBuyDialogOpen(false); // ダイアログを閉じる
      
      const client = await getClient();
      
      console.log("買いオファー処理開始:", {
        nftID: nft.NFTokenID,
        owner: nft.Owner,
        amount: buyAmount,
        effectiveOfferID,
        effectiveOfferAmount
      });
      
      // 売りオファーが存在する場合
      if (effectiveOfferID && effectiveOfferAmount) {
        // オファーの承認（購入）
        const acceptResult = await acceptNFTOffer(client, wallet, effectiveOfferID);
        console.log("NFT購入結果:", acceptResult);
        toast.success("NFTを購入しました");
      } else {
        // 売りオファーがない場合は買いオファーを作成
        const amount = xrpToDrops(buyAmount);
        
        // 買いオファー作成
        const offerID = await createNFTOffer(
          client,
          wallet,
          nft.NFTokenID,
          amount,
          false, // 買いオファー
          undefined, // destination
          nft.Owner // 所有者アドレス
        );
        
        console.log("買いオファー作成結果:", offerID);
        
        if (offerID === "unknown-offer-id" || offerID === "") {
          toast.warning("オファーは作成されましたが、IDを取得できませんでした。ネットワークの応答を待っています...");
          // 少し待機して更新を促す
          setTimeout(() => {
            onUpdate?.();
          }, 3000);
        } else {
          toast.success("NFTの買いオファーを作成しました");
        }
      }
      
      onUpdate?.();
    } catch (error) {
      console.error("買いオファー処理エラー:", error);
      let errorMessage = "買いオファーの作成に失敗しました";
      
      // エラーメッセージをより詳細に
      if (error instanceof Error) {
        if (error.message.includes("Owner must be present")) {
          errorMessage = "NFTの所有者情報が不足しています";
        } else if (error.message.includes("tecNO_ENTRY")) {
          errorMessage = "指定されたNFTが見つかりません";
        } else if (error.message.includes("tecUNFUNDED")) {
          errorMessage = "残高が不足しています";
        }
      }
      
      toast.error(effectiveOfferID ? "NFTの購入に失敗しました" : errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // NFTの所有者がログイン中のウォレットかどうかを判定
  const isOwner = () => {
    if (!wallet) return false;
    
    // Ownerプロパティがある場合はそれを使用
    if (nft.Owner) {
      return nft.Owner === wallet.classicAddress;
    }
    
    // 旧ロジック: IssuerがOwnerと見なされていた場合
    return nft.Issuer === wallet.classicAddress;
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
        {metadata?.image && !imageError ? (
          <img
            src={metadata.image}
            alt={metadata.name || "NFT"}
            className="max-w-full max-h-full object-contain"
            onError={() => {
              console.error("Image loading error");
              setImageError(true);
            }}
          />
        ) : (
          <div className="text-gray-400 flex flex-col items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="mt-2 text-sm">イメージなし</span>
          </div>
        )}
      </div>
      
      <CardContent className="p-4 flex-grow">
        <h3 className="font-medium truncate">
          {metadata?.name || "NFT"}
          {nft.Issuer === wallet?.classicAddress && (
            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              発行者
            </span>
          )}
          {wallet?.type === WalletType.CHARLIE && nft.Issuer === wallet.classicAddress && (
            <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
              Charlie発行
            </span>
          )}
        </h3>
        <p className="text-sm text-gray-500 line-clamp-2 mt-1 h-10">
          {metadata?.description || "説明なし"}
        </p>
        <div className="flex flex-wrap gap-1 mt-2 mb-1">
          {!isTransferable && (
            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
              転送不可
            </span>
          )}
          {isOnlyXRP && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
              XRPのみ
            </span>
          )}
          {isBurnable && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
              焼却可能
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 truncate">
          ID: <a href={`https://testnet.xrpl.org/nft/${nft.NFTokenID}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">{nft.NFTokenID}</a>
        </p>
      </CardContent>
      
      <CardFooter className="p-4 pt-0 flex gap-2">
        {/* 自分のNFTリストで、かつ自分のNFTの場合は売るボタンを表示（転送可能な場合のみ） */}
        {isOwnedList && isOwner() && isTransferable && !hasSellOffer && (
          <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="flex-1 bg-green-600 hover:bg-green-700" disabled={isLoading || disabled}>
                売りオファー
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>NFTを売る</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    販売価格 (XRP)
                  </label>
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    placeholder="販売価格を入力してください"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    設定した価格でNFTが販売されます。
                  </p>
                  {isOnlyXRP && (
                    <p className="text-xs text-amber-600 mt-1">
                      このNFTはXRPでのみ取引可能です。
                    </p>
                  )}
                </div>
                
                <Button 
                  onClick={handleSellNFT}
                  disabled={isLoading || !sellAmount || disabled}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? "処理中..." : "出品する"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        
        {/* 売却中の表示 - 実際の売りオファーの存在に基づいて表示 */}
        {isOwnedList && isOwner() && isTransferable && hasSellOffer && (
          <Button variant="outline" size="sm" className="flex-1 bg-amber-50 text-amber-800 border-amber-200" disabled={true}>
            売却中... ({formatAmountFromDrops(effectiveOfferAmount)} XRP)
          </Button>
        )}
        
        {/* 転送不可のNFTの場合に表示 */}
        {isOwnedList && isOwner() && !isTransferable && (
          <Button variant="outline" size="sm" className="flex-1" disabled={true}>
            転送不可
          </Button>
        )}
        
        {/* マーケットプレイス表示で、他者のNFTの場合は買うボタンを表示（転送可能な場合のみ） */}
        {!isOwnedList && !isOwner() && wallet && isTransferable && (
          <>
            <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1" 
                  disabled={isLoading || disabled || myBuyOffer !== undefined}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader size="sm" color="primary" />
                      処理中
                    </span>
                  ) : myBuyOffer ? (
                    "オファー済み"
                  ) : effectiveOfferAmount ? (
                    "購入する"
                  ) : (
                    "買いオファー"
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{effectiveOfferAmount ? "NFTを購入" : "NFTの買いオファーを作成"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {myBuyOffer ? (
                    // 既に自分の買いオファーが存在する場合
                    <div className="space-y-2 text-center">
                      <p className="font-medium">このNFTには既に買いオファーを出しています</p>
                      <p className="text-sm text-gray-500">金額: {formatAmountFromDrops(myBuyOffer.amount)} XRP</p>
                      <p className="text-xs text-gray-400">オファーID: {myBuyOffer.offerID.substring(0, 8)}...</p>
                    </div>
                  ) : effectiveOfferAmount ? (
                    // 既存の売りオファーがある場合
                    <div className="space-y-2 text-center">
                      <p className="font-medium">このNFTは{formatAmountFromDrops(effectiveOfferAmount)} XRPで販売中です</p>
                      <p className="text-sm text-gray-500">この価格で購入しますか？</p>
                    </div>
                  ) : (
                    // 売りオファーがない場合は価格を入力
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        希望購入価格 (XRP)
                      </label>
                      <Input
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(e.target.value)}
                        placeholder="購入希望金額を入力"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        指定した価格で買いオファーを出します。売り手がオファーを承認すると取引が成立します。
                      </p>
                      {isOnlyXRP && (
                        <p className="text-xs text-amber-600 mt-1">
                          このNFTはXRPでのみ取引可能です。
                        </p>
                      )}
                      <p className="text-xs text-amber-700 mt-1">
                        所有者: {nft.Owner ? (
                          <a href={`https://testnet.xrpl.org/accounts/${nft.Owner}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">
                            {nft.Owner.substring(0, 6) + '...' + nft.Owner.substring(nft.Owner.length - 4)}
                          </a>
                        ) : '不明'}
                      </p>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleBuyNFT}
                    disabled={isLoading || disabled || (!effectiveOfferAmount && (!buyAmount || parseFloat(buyAmount) <= 0)) || myBuyOffer !== undefined}
                    className={`w-full ${effectiveOfferAmount ? "bg-green-600 hover:bg-green-700" : ""}`}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader size="sm" color="white" />
                        処理中...
                      </span>
                    ) : myBuyOffer ? "オファー済み" : effectiveOfferAmount ? "購入する" : "買いオファーを作成"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
        
        {/* 自分のNFTリストで、自分のNFTの場合、かつ焼却可能な場合のみ焼却ボタンを表示 */}
        {isOwnedList && isOwner() && isBurnable && !hasSellOffer && (
          <Button 
            variant="destructive" 
            size="sm" 
            className="flex-1"
            onClick={handleBurnNFT}
            disabled={isLoading || disabled}
          >
            焼却
          </Button>
        )}
      </CardFooter>
    </Card>
  );
} 