"use client";

import { WalletType } from "@/lib/xrpl/wallet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WalletSelectorProps {
  activeWalletType: WalletType | null;
  onChange: (walletType: WalletType) => void;
  disabled?: boolean;
}

export function WalletSelector({ activeWalletType, onChange, disabled = false }: WalletSelectorProps) {
  const handleWalletChange = (value: string) => {
    onChange(value as WalletType);
  };

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">アカウント選択</label>
      <Select
        value={activeWalletType || undefined}
        onValueChange={handleWalletChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="アカウントを選択" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={WalletType.ALICE}>Alice</SelectItem>
          <SelectItem value={WalletType.BOB}>Bob</SelectItem>
          <SelectItem value={WalletType.CHARLIE}>Charlie</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
} 