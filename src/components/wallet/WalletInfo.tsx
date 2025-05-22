"use client";

import { WalletState, WalletType } from "@/lib/xrpl/wallet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface WalletInfoProps {
  wallet: WalletState;
}

interface AvatarInfo {
  abbr: string;
  bgColor: string;
}

export function WalletInfo({ wallet }: WalletInfoProps) {
  // ウォレットのタイプに応じて表示する略称と色を設定
  const getAvatarInfo = (): AvatarInfo => {
    switch (wallet.type) {
      case WalletType.ALICE:
        return { abbr: "AL", bgColor: "bg-pink-500" };
      case WalletType.BOB:
        return { abbr: "BO", bgColor: "bg-green-500" };
      case WalletType.CHARLIE:
        return { abbr: "CH", bgColor: "bg-blue-500" };
      default:
        return { abbr: "??", bgColor: "bg-gray-500" };
    }
  };

  const { abbr, bgColor } = getAvatarInfo();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarFallback className={bgColor}>{abbr}</AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-medium">{wallet.type}</h3>
          <p className="text-sm text-gray-500">残高: {wallet.balance} XRP</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">アドレス</p>
          <p className="text-xs text-gray-500 break-all">
            <a href={`https://testnet.xrpl.org/accounts/${wallet.classicAddress}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">
              {wallet.classicAddress}
            </a>
          </p>
        </div>
        
        <div>
          <p className="text-sm font-medium">シード (秘密鍵)</p>
          <p className="text-xs text-gray-500 break-all">{wallet.seed}</p>
        </div>
      </div>
    </div>
  );
} 