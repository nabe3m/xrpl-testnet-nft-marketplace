import { Client, Wallet, convertStringToHex, dropsToXrp } from "xrpl";
import { z } from "zod";

// ウォレットの種類
export enum WalletType {
  ALICE = "Alice",
  BOB = "Bob",
  CHARLIE = "Charlie"
}

// ウォレットの状態を表すスキーマ
export const WalletSchema = z.object({
  type: z.nativeEnum(WalletType),
  seed: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
  classicAddress: z.string(),
  balance: z.number().default(0),
  lastUpdated: z.number().default(0), // 前回更新タイムスタンプ
});

export type WalletState = z.infer<typeof WalletSchema>;

// ウォレットの残高を取得する関数
export async function getAccountBalance(client: Client, address: string): Promise<number> {
  try {
    // クライアントがnullまたは接続されていない場合
    if (!client) {
      console.error("XRPLクライアントが初期化されていません");
      return 0; // エラー時はデフォルト値として0を返す
    }

    if (!client.isConnected()) {
      console.warn("XRPLクライアントが接続されていません。再接続を試みます...");
      await client.connect();
    }
    
    const { result } = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });

    console.log(result);
    
    // XRPは小数点6桁
    return dropsToXrp(result.account_data.Balance);
  } catch (error) {
    console.error(`Failed to get account balance: ${error}`);
    // エラー時はデフォルト値として0を返す
    return 0;
  }
}

// ウォレットの残高を更新する関数
export async function updateWalletBalance(client: Client, walletState: WalletState): Promise<WalletState> {
  try {
    // クライアントがnullまたは接続されていない場合
    if (!client) {
      console.error("XRPLクライアントが初期化されていません");
      return { 
        ...walletState,
        lastUpdated: Date.now() 
      };
    }
    
    const balance = await getAccountBalance(client, walletState.classicAddress);
    
    // 新しい残高で更新したウォレット情報を返す
    return {
      ...walletState,
      balance,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error(`Failed to update wallet balance: ${error}`);
    // エラーの場合は元のウォレット情報をそのまま返す
    return walletState;
  }
}

// ウォレットを生成する関数
export async function createWallet(client: Client, type: WalletType): Promise<WalletState> {
  try {
    // 新しいウォレットを作成
    const { wallet } = await client.fundWallet();
    
    // 残高を取得
    const balance = await getAccountBalance(client, wallet.address);
    
    return {
      type,
      seed: wallet.seed || "",
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey,
      classicAddress: wallet.address,
      balance,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error(`Failed to create wallet: ${error}`);
    throw error;
  }
}

// 複数のウォレットを作成する関数
export async function createAllWallets(client: Client): Promise<Record<WalletType, WalletState>> {
  const alice = await createWallet(client, WalletType.ALICE);
  const bob = await createWallet(client, WalletType.BOB);
  const charlie = await createWallet(client, WalletType.CHARLIE);
  
  return {
    [WalletType.ALICE]: alice,
    [WalletType.BOB]: bob,
    [WalletType.CHARLIE]: charlie,
  };
}

// ウォレットからウォレットオブジェクトを生成する関数
export function getXrplWallet(walletState: WalletState): Wallet {
  return Wallet.fromSeed(walletState.seed);
} 