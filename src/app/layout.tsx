import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { XRPLClientProvider } from "@/lib/xrpl/provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "XRPL NFT マーケットプレイス",
  description: "XRPLのNFT機能をテストするためのアプリです",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <XRPLClientProvider>
          {children}
          <Toaster />
        </XRPLClientProvider>
      </body>
    </html>
  );
}
