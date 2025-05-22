import { create } from 'zustand';
import type { WalletState } from './xrpl/wallet';

interface AppState {
  // ウォレット切り替え中のロック状態
  isWalletSwitching: boolean;
  // 現在のウォレット情報
  currentWallet: WalletState | null;
  // 全体的なロック状態（ロック中は全機能を無効化）
  isLocked: boolean;
  
  // アクション
  setWalletSwitching: (switching: boolean) => void;
  setCurrentWallet: (wallet: WalletState | null) => void;
  setLocked: (locked: boolean) => void;
  
  // ウォレット切り替え開始時に呼び出す
  startWalletSwitch: () => void;
  // ウォレット切り替え完了時に呼び出す
  finishWalletSwitch: (wallet: WalletState | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isWalletSwitching: false,
  currentWallet: null,
  isLocked: false,
  
  setWalletSwitching: (switching) => {
    const current = get().isWalletSwitching;
    if (current === switching) return;
    set({ isWalletSwitching: switching });
  },
  
  setCurrentWallet: (wallet) => {
    const current = get().currentWallet;
    if (current === null && wallet === null) return;
    if (current && wallet && current.classicAddress === wallet.classicAddress && 
        current.seed === wallet.seed) return;
    set({ currentWallet: wallet });
  },
  
  setLocked: (locked) => {
    const current = get().isLocked;
    if (current === locked) return;
    set({ isLocked: locked });
  },
  
  startWalletSwitch: () => {
    const { isWalletSwitching, isLocked } = get();
    if (isWalletSwitching && isLocked) return;
    
    set({ 
      isWalletSwitching: true, 
      isLocked: true,
    });
  },
  
  finishWalletSwitch: (wallet) => {
    const current = get().currentWallet;
    const walletChanged = 
      (current === null && wallet !== null) || 
      (current !== null && wallet === null) ||
      (current && wallet && (current.classicAddress !== wallet.classicAddress || current.seed !== wallet.seed));
      
    if (!walletChanged && current && wallet) {
      set({ 
        isWalletSwitching: false, 
        isLocked: false
      });
      return;
    }
    
    set({ 
      isWalletSwitching: false, 
      isLocked: false,
      currentWallet: wallet 
    });
  },
})); 