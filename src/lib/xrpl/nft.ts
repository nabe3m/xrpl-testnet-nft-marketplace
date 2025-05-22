import { 
  Client, 
  Wallet, 
  convertStringToHex, 
  NFTokenMintFlags,
  NFTokenMint,
  NFTokenCreateOffer,
  NFTokenAcceptOffer,
  NFTokenCancelOffer,
  NFTokenBurn,
  NFTokenMintFlags as NFTFlags
} from "xrpl";
import { WalletState, getXrplWallet } from "./wallet";

/**
 * NFTフラグの意味
 * 
 * 1 (lsfBurnable): NFTは焼却可能
 * 2 (lsfOnlyXRP): 取引にはXRPのみを使用可能
 * 4 (lsfTrustLine): 発行者の信頼線を必要とする
 * 8 (lsfTransferable): NFTは転送可能（このフラグが設定されていないと転送不可）
 */

// NFTのメタデータ
export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
}

// NFTを発行する関数
export async function mintNFT(
  client: Client,
  issuerWallet: WalletState,
  metadata: string, // JSON形式のメタデータ
  transferFee: number = 0,
  isBurnable: boolean = true,
  isTransferable: boolean = true,
  isOnlyXRP: boolean = true
): Promise<string> {
  try {
    // ウォレットオブジェクトを取得
    const wallet = getXrplWallet(issuerWallet);

    // フラグを設定
    let flags = 0;
    if (isBurnable) flags |= NFTFlags.tfBurnable;
    if (isOnlyXRP) flags |= NFTFlags.tfOnlyXRP;
    if (isTransferable) flags |= NFTFlags.tfTransferable;

    // TransferFeeは0〜50000の範囲（0.000%〜50.000%）
    // 例: 0.5% = 500, 最大50% = 50000
    const transferFeeValue = Math.floor(transferFee * 1000);
    
    if (transferFeeValue > 50000) {
      throw new Error("TransferFee cannot exceed 50%");
    }

    // メタデータをHexエンコード
    const hexMetadata = metadata.trim() !== "" ? convertStringToHex(metadata) : undefined;
    console.log("Hex encoded metadata length:", hexMetadata ? hexMetadata.length : 0);

    // NFTMintトランザクションの基本構造を作成
    const txData: NFTokenMint = {
      "TransactionType": "NFTokenMint",
      "Account": wallet.address,
      "NFTokenTaxon": 0,
      "Flags": flags,
      "URI": hexMetadata,
      "TransferFee": transferFeeValue
    };

    // TransferFeeはtfTransferableフラグが設定されている場合のみ設定
    if (isTransferable && transferFeeValue > 0) {
      txData.TransferFee = transferFeeValue;
    }

    // メタデータが有効な場合のみURI設定
    if (hexMetadata) {
      // RFC2379 data URL形式として設定
      txData.URI = hexMetadata;
      console.log("Setting URI field in NFTokenMint transaction");
    }
    
    console.log("Minting NFT with params:", JSON.stringify(txData, null, 2));

    // autofillを使用してトランザクションを準備
    const prepared = await client.autofill(txData);
    const max_ledger = prepared.LastLedgerSequence;
    
    console.log("Prepared transaction:", JSON.stringify(prepared, null, 2));
    console.log(`Transaction will expire after ledger: ${max_ledger}`);

    // トランザクション実行
    const tx = await client.submitAndWait(prepared, { wallet });
    console.log("NFT mint result:", JSON.stringify(tx.result, null, 2));

    // NFTokenIDを取得
    const meta = tx.result.meta as any;
    const nftokenID = meta?.nftoken_id as string;
    
    if (!nftokenID) {
      console.error("Failed to get NFToken ID from response:", tx.result);
      throw new Error("Failed to get NFToken ID");
    }
    
    return nftokenID;
  } catch (error: any) {
    // テスト用のサーバーがNFT機能をサポートしていない場合の特別なエラーメッセージ
    if (error.message && (
      error.message.includes("amendmentBlocked") || 
      error.message.includes("Amendment blocked")
    )) {
      console.error("NFT機能がサポートされていないサーバーに接続しています。別のサーバーを試してください。");
      throw new Error("このサーバーはNFT機能をサポートしていません。アプリケーションを再起動し、別のサーバーに接続してください。");
    }
    
    console.error(`Failed to mint NFT: ${error}`);
    throw error;
  }
}

// NFTのオファーを作成する関数
export async function createNFTOffer(
  client: Client,
  walletState: WalletState,
  nftokenID: string,
  amount: string,
  isSell: boolean = true,
  destination?: string,
  owner?: string // 買いオファーの場合に必要なNFT所有者のアドレス
): Promise<string> {
  try {
    const wallet = getXrplWallet(walletState);
    
    const transactionBlob: NFTokenCreateOffer = {
      TransactionType: "NFTokenCreateOffer",
      Account: wallet.address,
      NFTokenID: nftokenID,
      Amount: amount,
      Flags: isSell ? 1 : 0, // 1 = sell offer, 0 = buy offer
    };
    
    // 買いオファーの場合は所有者の指定が必要
    if (!isSell) {
      if (!owner) {
        throw new Error("Owner must be present for buy offers");
      }
      transactionBlob.Owner = owner;
    }
    
    if (destination) {
      transactionBlob.Destination = destination;
    }
    
    console.log("NFTオファー作成リクエスト:", transactionBlob);
    const tx = await client.submitAndWait(transactionBlob, { wallet });
    console.log("NFTオファー作成レスポンス:", JSON.stringify(tx.result, null, 2));
    
    // オファーIDを返す（メタデータから取得）
    const meta = tx.result.meta as any;
    console.log("メタデータ:", JSON.stringify(meta, null, 2));
    
    // 異なるXRPLバージョンでは異なるフィールド名を使用する可能性がある
    let offerIndex = meta?.offer_id;  // 古いバージョン
    
    // フィールドが存在しない場合は、ノードを検索
    if (!offerIndex) {
      // AffectedNodesから検索
      if (meta?.AffectedNodes) {
        for (const node of meta.AffectedNodes) {
          if (node.CreatedNode && node.CreatedNode.LedgerEntryType === "NFTokenOffer") {
            offerIndex = node.CreatedNode.LedgerIndex;
            break;
          }
        }
      }
    }
    
    if (!offerIndex) {
      console.warn("オファーIDが見つかりませんでした。トランザクションは成功しましたがIDを取得できません");
      // 何らかのIDを返す必要がある場合はトランザクションハッシュをフォールバックとして使用
      offerIndex = tx.result.hash || "unknown-offer-id";
    }
    
    console.log("取得したオファーID:", offerIndex);
    return offerIndex || "unknown-offer-id";
  } catch (error: any) {
    console.error(`Failed to create NFT offer: ${error}`);
    // テスト用のサーバーがNFT機能をサポートしていない場合の特別なエラーメッセージ
    if (error.message && (
      error.message.includes("amendmentBlocked") || 
      error.message.includes("Amendment blocked")
    )) {
      console.error("NFT機能がサポートされていないサーバーに接続しています。別のサーバーを試してください。");
      throw new Error("このサーバーはNFT機能をサポートしていません。アプリケーションを再起動し、別のサーバーに接続してください。");
    }
    throw error;
  }
}

// NFTのオファーを承認する関数
export async function acceptNFTOffer(
  client: Client,
  walletState: WalletState,
  offerID: string,
  isBuyOffer: boolean = false
): Promise<boolean> {
  try {
    const wallet = getXrplWallet(walletState);
    
    const transactionBlob: NFTokenAcceptOffer = {
      TransactionType: "NFTokenAcceptOffer",
      Account: wallet.address,
    };
    
    // 買いオファーか売りオファーかによってフィールドを設定
    if (isBuyOffer) {
      transactionBlob.NFTokenBuyOffer = offerID;
    } else {
      transactionBlob.NFTokenSellOffer = offerID;
    }
    
    console.log("NFTオファー承認リクエスト:", transactionBlob);
    const tx = await client.submitAndWait(transactionBlob, { wallet });
    console.log("NFTオファー承認レスポンス:", JSON.stringify(tx.result, null, 2));
    
    return true;
  } catch (error) {
    console.error(`Failed to accept NFT offer: ${error}`);
    throw error;
  }
}

// NFTのオファーをキャンセルする関数
export async function cancelNFTOffer(
  client: Client,
  walletState: WalletState,
  offerIDs: string[]
): Promise<boolean> {
  try {
    const wallet = getXrplWallet(walletState);
    
    const transactionBlob: NFTokenCancelOffer = {
      TransactionType: "NFTokenCancelOffer",
      Account: wallet.address,
      NFTokenOffers: offerIDs,
    };
    
    await client.submitAndWait(transactionBlob, { wallet });
    return true;
  } catch (error) {
    console.error(`Failed to cancel NFT offer: ${error}`);
    throw error;
  }
}

// NFTを焼却する関数
export async function burnNFT(
  client: Client,
  walletState: WalletState,
  nftokenID: string
): Promise<boolean> {
  try {
    const wallet = getXrplWallet(walletState);
    
    const transactionBlob: NFTokenBurn = {
      TransactionType: "NFTokenBurn",
      Account: wallet.address,
      NFTokenID: nftokenID,
    };
    
    await client.submitAndWait(transactionBlob, { wallet });
    return true;
  } catch (error) {
    console.error(`Failed to burn NFT: ${error}`);
    throw error;
  }
}

// アカウントが所有するNFTを取得する関数
export async function getAccountNFTs(
  client: Client,
  accountAddress: string
): Promise<any[]> {
  try {
    const response = await client.request({
      command: "account_nfts",
      account: accountAddress,
    });
    
    return response.result.account_nfts;
  } catch (error) {
    console.error(`Failed to get account NFTs: ${error}`);
    throw error;
  }
}

// NFTのオファーを取得する関数
export async function getNFTOffers(
  client: Client,
  nftokenID: string
): Promise<any[]> {
  try {
    // sell_offersを取得
    const sellResponse = await client.request({
      command: "nft_sell_offers",
      nft_id: nftokenID,
    });
    
    return sellResponse.result.offers || [];
  } catch (error: unknown) {
    // objectNotFoundエラーの場合は空配列を返す（NFTは存在するがオファーがない場合）
    const errorStr = String(error);
    if (errorStr.includes("objectNotFound") || errorStr.includes("object was not found")) {
      console.log(`No sell offers found for NFT: ${nftokenID}`);
      return [];
    }
    
    // その他のエラーは通常通り処理
    console.error(`Failed to get NFT offers: ${error}`);
    throw error;
  }
}

// NFTのbuyオファーを取得する関数（追加）
export async function getNFTBuyOffers(
  client: Client,
  nftokenID: string
): Promise<any[]> {
  try {
    // buy_offersを取得
    const buyResponse = await client.request({
      command: "nft_buy_offers",
      nft_id: nftokenID,
    });
    
    return buyResponse.result.offers || [];
  } catch (error: unknown) {
    // objectNotFoundエラーの場合は空配列を返す
    const errorStr = String(error);
    if (errorStr.includes("objectNotFound") || errorStr.includes("object was not found")) {
      console.log(`No buy offers found for NFT: ${nftokenID}`);
      return [];
    }
    
    console.error(`Failed to get NFT buy offers: ${error}`);
    throw error;
  }
}

// すべてのNFTオファー（売りと買い）を取得する関数
export async function getAllNFTOffers(
  client: Client,
  nftokenID: string
): Promise<{ sellOffers: any[], buyOffers: any[] }> {
  try {
    // 並列で両方のオファーを取得
    const [sellOffers, buyOffers] = await Promise.all([
      getNFTOffers(client, nftokenID).catch(() => []),
      getNFTBuyOffers(client, nftokenID).catch(() => [])
    ]);
    
    return {
      sellOffers,
      buyOffers
    };
  } catch (error: unknown) {
    console.error(`Failed to get all NFT offers: ${error}`);
    return {
      sellOffers: [],
      buyOffers: []
    };
  }
} 