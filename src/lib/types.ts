import { z } from "zod";
import { WalletState } from "./xrpl/wallet";

// NFT関連の型定義
export interface NFT {
  NFTokenID: string;
  Issuer: string;
  Owner?: string;
  URI?: string;
  Flags?: number;
  tfFlags?: number;
  TransferFee?: number;
}

// NFTメタデータの型定義
export interface NFTMetadata {
  name: string;
  description: string;
  image: string | null;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

// NFTオファーの型定義
export interface NFTOffer {
  offerID: string;
  amount: string;
  owner: string;
  destination?: string;
  expiration?: number;
  isSellOffer: boolean;
  nftokenID: string;
  flags?: number;
  // XRPLからの応答データをすべて含むオプションのフィールド
  rawData?: Record<string, any>;
}

// 接続状態の型定義
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

// UI関連の共通型定義
export interface ComponentWithWallet {
  wallet: WalletState | null;
  onUpdate?: () => void;
} 