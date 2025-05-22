import { WalletState, WalletType } from "./xrpl/wallet";

// ローカルストレージのキー
const WALLETS_STORAGE_KEY = "xrpl-nft-marketplace-wallets";
const ACTIVE_WALLET_TYPE_KEY = "xrpl-nft-marketplace-active-wallet-type";

// ウォレット情報をローカルストレージに保存する関数
export function saveWallets(wallets: Record<WalletType, WalletState>): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets));
  }
}

// ウォレット情報をローカルストレージから取得する関数
export function getWallets(): Record<WalletType, WalletState> | null {
  if (typeof window !== "undefined") {
    const storedWallets = localStorage.getItem(WALLETS_STORAGE_KEY);
    if (storedWallets) {
      return JSON.parse(storedWallets);
    }
  }
  return null;
}

// ウォレット情報をローカルストレージから削除する関数
export function clearWallets(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(WALLETS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_WALLET_TYPE_KEY);
  }
}

// 現在アクティブなウォレットタイプを保存する関数
export function saveActiveWalletType(walletType: WalletType): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(ACTIVE_WALLET_TYPE_KEY, walletType);
  }
}

// 現在アクティブなウォレットタイプを取得する関数
export function getActiveWalletType(): WalletType | null {
  if (typeof window !== "undefined") {
    const walletType = localStorage.getItem(ACTIVE_WALLET_TYPE_KEY) as WalletType | null;
    return walletType;
  }
  return null;
} 