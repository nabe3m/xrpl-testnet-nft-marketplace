"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getClient, reconnectClient } from "@/lib/xrpl/client";
import { WalletState, WalletType } from "@/lib/xrpl/wallet";
import { mintNFT } from "@/lib/xrpl/nft";
import { 
  convertFileToBase64, 
  validateFile, 
  ALLOWED_FILE_TYPES,
  createAndSaveMetadataFile,
  generateMetadataContent
} from "@/lib/upload";
import { useAppStore } from "@/lib/store";

// フォームのバリデーションスキーマ
const formSchema = z.object({
  name: z.string().min(1, { message: "NFT名を入力してください" }),
  description: z.string().min(1, { message: "説明を入力してください" }),
  transferFee: z.coerce.number().min(0).max(50, { message: "転送手数料は0%〜50%の間で指定してください" }),
  isBurnable: z.boolean().optional().default(true),
  isTransferable: z.boolean().optional().default(true),
  isOnlyXRP: z.boolean().optional().default(true),
});

type FormValues = {
  name: string;
  description: string;
  transferFee: number;
  isBurnable?: boolean;
  isTransferable?: boolean;
  isOnlyXRP?: boolean;
};

interface NFTMinterProps {
  wallet: WalletState | null;
}

export function NFTMinter({ wallet }: NFTMinterProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mintedNFTId, setMintedNFTId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [flagsOpen, setFlagsOpen] = useState(false);
  
  // グローバルステートを使用
  const { isLocked } = useAppStore();

  // フォーム初期化
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      transferFee: 0,
      isBurnable: true,
      isTransferable: true,
      isOnlyXRP: true,
    },
  });

  // ファイルをBase64に変換する関数
  const convertToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert file to base64"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }, []);

  // ウォレットが変更されたときにリセット
  useEffect(() => {
    // 現在のウォレット情報をログ出力
    console.log("NFTMinter: ウォレット変更検出", {
      wallet: wallet ? {
        type: wallet.type,
        address: wallet.classicAddress
      } : null
    });

    // フォームをリセット
    form.reset();
    
    // ファイル選択状態をリセット
    setSelectedFile(null);
    setFileBase64(null);
    setPreviewUrl(null);
    
    // ミント状態をリセット
    setMintedNFTId(null);
    
  }, [wallet, form]);

  // wallet-changedイベントのリスナーを追加
  useEffect(() => {
    const handleWalletChanged = () => {
      console.log("NFTMinter: ウォレット変更イベント受信");
      
      // ミント状態をリセット
      setMintedNFTId(null);
      
      // 処理中の状態をリセット
      setIsLoading(false);
    };
    
    window.addEventListener('wallet-changed', handleWalletChanged);
    
    return () => {
      window.removeEventListener('wallet-changed', handleWalletChanged);
    };
  }, []);

  // 接続回復時のイベントリスナー（コンポーネントマウント時に一度だけ設定）
  useEffect(() => {
    const handleWalletReconnected = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("NFTMinter: 接続回復イベント受信", customEvent.detail);
    };
    
    window.addEventListener('wallet-reconnected', handleWalletReconnected);
    
    return () => {
      window.removeEventListener('wallet-reconnected', handleWalletReconnected);
    };
  }, []);

  // ファイル選択時の処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    
    console.log("ファイル選択イベント:", e.target.files);
    
    const file = e.target.files?.[0] || null;
    
    if (!file) {
      console.log("ファイル選択がキャンセルされました");
      setSelectedFile(null);
      setPreviewUrl(null);
      setFileBase64(null);
      return;
    }
    
    console.log("選択されたファイル:", { name: file.name, type: file.type, size: file.size });
    
    // ファイルのバリデーション
    const validation = validateFile(file);
    
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }
    
    try {
      // ファイルをデータURLとして読み込む
      const base64Data = await convertToBase64(file);
      
      console.log("Base64データを生成しました", {
        length: base64Data.length,
        preview: base64Data.substring(0, 50) + "..."
      });
      
      // ファイル情報を設定
      setSelectedFile(file);
      setPreviewUrl(base64Data);
      setFileBase64(base64Data);
      
      toast.success("画像ファイルを選択しました");
    } catch (error) {
      console.error("ファイル処理エラー:", error);
      toast.error("ファイルの処理中にエラーが発生しました");
      setSelectedFile(null);
      setPreviewUrl(null);
      setFileBase64(null);
    }
    
    // ファイル入力をリセット（同じファイルを再選択できるように）
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 画像ファイルを手動で選択
  const handleSelectFile = () => {
    if (isLocked) return;
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // NFTをミントする処理
  const onSubmit = async (values: FormValues) => {
    if (isLocked) return;
    
    console.log("NFTミント開始", { values, hasFile: !!selectedFile });
    
    if (!wallet) {
      toast.error("ウォレットが選択されていません");
      return;
    }
    
    if (!selectedFile || !fileBase64) {
      toast.error("画像ファイルを選択してください");
      return;
    }
    
    try {
      setIsLoading(true);
      
      // FormDataオブジェクトの作成
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', values.name);
      formData.append('description', values.description);
      
      console.log("APIにファイルをアップロード中...");
      
      // APIエンドポイントにファイルとメタデータを送信
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ファイルのアップロードに失敗しました');
      }
      
      const data = await response.json();
      console.log("ファイルアップロード成功", data);
      
      // Vercel環境でのデバッグ情報を表示
      if (data.isVercelProduction) {
        console.log("Vercel環境: メタデータを直接使用します");
      }
      
      // XRPLクライアントを取得
      console.log("XRPLクライアント取得中...");
      let client;
      
      try {
        client = await getClient();
      } catch (connectionError) {
        console.error("XRPLクライアント接続エラー:", connectionError);
        // 接続エラーの場合は再接続を試みる
        console.log("XRPLサーバーへの再接続を試みています...");
        toast.info("XRPLサーバーへの再接続を試みています...");
        client = await reconnectClient();
      }
      
      console.log("NFTミント処理を開始します。ウォレット:", {
        type: wallet.type,
        address: wallet.classicAddress
      });
      
      try {
        // NFTをミント - メタデータURLをURIとして使用
        // Vercel環境の場合は直接メタデータを使用
        const metadataUri = data.isVercelProduction 
          ? data.metadataRaw  // 直接JSONメタデータを使用
          : data.metadataUrl; // JSONメタデータへのURL
          
        console.log("使用するメタデータ:", metadataUri);
        
        const nftokenID = await mintNFT(
          client,
          wallet,
          metadataUri,
          values.transferFee,
          values.isBurnable,    // フォームから取得したフラグを使用
          values.isTransferable, // フォームから取得したフラグを使用
          values.isOnlyXRP       // フォームから取得したフラグを使用
        );
        
        console.log("NFTミント成功!", { nftokenID });
        
        // ミント成功
        setMintedNFTId(nftokenID);
        
        // NFT発行成功イベントを発行（マーケットプレイスとNFTリストの更新トリガー）
        window.dispatchEvent(new CustomEvent('nft-minted', { 
          detail: { 
            nftokenID,
            wallet: wallet.type 
          } 
        }));
        
        toast.success("NFTが発行されました!");
        
        // フォームをリセット
        form.reset();
        
        // ファイル選択状態をリセット
        setSelectedFile(null);
        setPreviewUrl(null);
        setFileBase64(null);
      } catch (mintError: any) {
        console.error("NFTミント処理エラー:", mintError);
        
        // NotConnectedError の場合は再接続を試みる
        if (mintError.toString().includes("NotConnectedError")) {
          console.log("接続エラーを検出しました。XRPLサーバーへの再接続を試みています...");
          toast.error("XRPLサーバーとの接続が失われました。再接続しています...");
          
          try {
            // 強制的に再接続
            client = await reconnectClient();
            
            // 再接続後に再度ミントを試みる
            toast.info("再接続しました。NFTミントを再試行しています...");
            
            // Vercel環境の場合は直接メタデータを使用
            const metadataUri = data.isVercelProduction 
              ? data.metadataRaw  // 直接JSONメタデータを使用
              : data.metadataUrl; // JSONメタデータへのURL
              
            const nftokenID = await mintNFT(
              client,
              wallet,
              metadataUri,
              values.transferFee,
              values.isBurnable,
              values.isTransferable,
              values.isOnlyXRP
            );
            
            console.log("NFTミント成功! (再試行後)", { nftokenID });
            
            // ミント成功
            setMintedNFTId(nftokenID);
            
            // NFT発行成功イベントを発行
            window.dispatchEvent(new CustomEvent('nft-minted', { 
              detail: { 
                nftokenID,
                wallet: wallet.type 
              } 
            }));
            
            toast.success("NFTが発行されました!");
            
            // フォームをリセット
            form.reset();
            
            // ファイル選択状態をリセット
            setSelectedFile(null);
            setPreviewUrl(null);
            setFileBase64(null);
            
            return;
          } catch (retryError) {
            console.error("再接続後のミント再試行エラー:", retryError);
            toast.error("NFTの発行に失敗しました。ネットワーク接続を確認してください。");
          }
        } else {
          toast.error(`NFTの発行に失敗しました: ${mintError.message || "不明なエラー"}`);
        }
      }
    } catch (error) {
      console.error("NFTミント処理エラー:", error);
      toast.error("NFTの発行に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // ウォレットが選択されているかどうか
  const isWalletSelected = wallet !== null;
  
  // フォームが有効かどうか
  const formValues = form.getValues();
  const isFormValid = formValues.name && formValues.description;
  const canSubmit = isWalletSelected && !isLoading && selectedFile && isFormValid && !isLocked;

  // デバッグ情報
  console.log("NFTMinter: レンダリング", {
    wallet: wallet ? wallet.type : null,
    isWalletSelected,
    selectedFile: selectedFile ? { name: selectedFile.name, type: selectedFile.type } : null,
    hasPreview: !!previewUrl,
    hasBase64: !!fileBase64,
    formValues,
    isFormValid,
    canSubmit,
    isLocked
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>NFT発行</CardTitle>
        <CardDescription>
          XRPLテストネット上でNFTを発行します
          {!isWalletSelected && " (ウォレットを選択してください)"}
          {isLocked && " (ウォレット切り替え中...)"}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {isLocked ? (
          <div className="text-center py-8">
            <p>ウォレット切り替え中...</p>
            <p className="text-sm text-gray-500 mt-2">
              処理が完了するまでお待ちください
            </p>
          </div>
        ) : mintedNFTId ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-100 rounded-md">
              <h3 className="font-medium text-green-800">NFTが発行されました！</h3>
              <p className="text-sm text-green-600 break-all mt-1">NFT ID: <a href={`https://testnet.xrpl.org/nft/${mintedNFTId}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">{mintedNFTId}</a></p>
            </div>
            
            <Button
              onClick={() => setMintedNFTId(null)}
              variant="outline"
              className="w-full"
              disabled={isLocked}
            >
              新しいNFTを発行する
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={(e) => {
              e.preventDefault();
              const values = form.getValues();
              onSubmit(values);
            }} className="space-y-6">
              <FormField<FormValues>
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NFT名</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="NFT名を入力" 
                        value={field.value?.toString() || ''} 
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        disabled={!isWalletSelected || isLoading || isLocked} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField<FormValues>
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>説明</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="NFTの説明を入力" 
                        value={field.value?.toString() || ''} 
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        disabled={!isWalletSelected || isLoading || isLocked} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField<FormValues>
                control={form.control}
                name="transferFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>転送手数料 (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="50"
                        step="0.1"
                        placeholder="転送手数料（%）"
                        value={field.value?.toString() || ''} 
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        disabled={!isWalletSelected || isLoading || isLocked}
                      />
                    </FormControl>
                    <FormDescription>
                      NFTが転送される際に徴収される手数料（0〜50%）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 border p-4 rounded-md">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setFlagsOpen(!flagsOpen)}>
                  <h3 className="font-medium">NFTフラグ設定</h3>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    {flagsOpen ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m18 15-6-6-6 6"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    )}
                  </Button>
                </div>
                
                {flagsOpen && (
                  <div className="space-y-4 mt-2">
                    <FormField<FormValues>
                      control={form.control}
                      name="isBurnable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between space-y-0 rounded-md border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>バーナブル</FormLabel>
                            <FormDescription>
                              NFTを後から焼却（破棄）できるようにする
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isWalletSelected || isLoading || isLocked}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField<FormValues>
                      control={form.control}
                      name="isTransferable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between space-y-0 rounded-md border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>転送可能</FormLabel>
                            <FormDescription>
                              NFTを他のアカウントに転送できるようにする
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isWalletSelected || isLoading || isLocked}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField<FormValues>
                      control={form.control}
                      name="isOnlyXRP"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between space-y-0 rounded-md border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>XRPのみで取引</FormLabel>
                            <FormDescription>
                              NFTの売買にXRPのみを使用する（他のトークンを使用不可）
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isWalletSelected || isLoading || isLocked}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
              
              <FormItem>
                <FormLabel>画像</FormLabel>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_FILE_TYPES.join(",")}
                    onChange={handleFileChange}
                    disabled={!isWalletSelected || isLoading || isLocked}
                    style={{ display: 'none' }} // 非表示にして独自のUIに置き換え
                  />
                  <Button 
                    type="button" 
                    onClick={handleSelectFile}
                    disabled={!isWalletSelected || isLoading || isLocked}
                    variant="outline"
                    className="w-full"
                  >
                    {selectedFile ? "画像ファイルを変更" : "画像ファイルを選択"}
                  </Button>
                  
                  {selectedFile && (
                    <p className="text-sm text-gray-500">
                      選択中: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                    </p>
                  )}
                </div>
                <FormDescription>
                  10MB以下のJPEG、PNG、GIF、WEBP、またはSVG形式の画像ファイル
                </FormDescription>
              </FormItem>
              
              {previewUrl && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">プレビュー</p>
                  <div className="border rounded-md overflow-hidden w-full h-48 flex items-center justify-center bg-gray-50">
                    <img 
                      src={previewUrl} 
                      alt="プレビュー" 
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        console.error("画像プレビューの読み込みエラー");
                        e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
                      }}
                    />
                  </div>
                </div>
              )}
              
              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full"
              >
                {isLoading ? "発行中..." : "NFTを発行する"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
} 