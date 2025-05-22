import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  api: {
    bodyParser: {
      sizeLimit: '10mb', // アップロードサイズ制限を10MBに設定
    },
    responseLimit: false, // レスポンスサイズ制限を無効化
  },
  // Vercel環境でのファイルシステムアクセスに関する設定
  serverRuntimeConfig: {
    // サーバー側でのみ利用可能な設定
    PROJECT_ROOT: process.cwd(),
  },
  // クライアント側とサーバー側の両方で利用可能な設定
  publicRuntimeConfig: {
    // 環境変数
    IS_VERCEL_PRODUCTION: process.env.VERCEL === '1',
  },
};

export default nextConfig;
