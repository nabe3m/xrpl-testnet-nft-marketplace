// ファイルをBase64に変換する関数
export function convertFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert file to base64"));
      }
    };
    reader.onerror = error => reject(error);
  });
}

// Unicode文字列をBase64に変換する関数（日本語等のマルチバイト文字対応）
export function unicodeToBase64(str: string): string {
  // 文字列をUTF-8のバイト配列に変換
  const utf8Bytes = new TextEncoder().encode(str);
  // バイト配列を文字ごとに変換してBase64エンコード用の文字列を作成
  let binaryString = '';
  utf8Bytes.forEach(byte => {
    binaryString += String.fromCharCode(byte);
  });
  // Base64エンコード
  return btoa(binaryString);
}

// NFTメタデータとして使えるURIを生成する関数（ローカルURLを使用）
export function generateLocalNftUri(name: string, description: string, imageFileName: string): string {
  // 画像のローカルURL（ホスト相対パス）
  const imageUrl = `/images/${imageFileName}`;
  
  // JSONメタデータ
  const metadata = {
    name,
    description,
    image: imageUrl,
    attributes: []
  };
  
  // JSONを文字列として返す
  return JSON.stringify(metadata);
}

// JSONメタデータをファイルとして保存し、そのURLを返す関数
export function createAndSaveMetadataFile(
  name: string,
  description: string,
  imageFileName: string
): { metadataFileName: string, metadataUrl: string } {
  // タイムスタンプを含むファイル名で一意性を確保
  const timestamp = Date.now();
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const metadataFileName = `${timestamp}_${safeName}.json`;
  
  // 画像のURLを指定（ホスト相対パス）
  const imageUrl = `/images/${imageFileName}`;
  
  // JSONメタデータオブジェクト
  const metadata = {
    name,
    description,
    image: imageUrl,
    attributes: [],
    created_at: new Date().toISOString()
  };
  
  // メタデータのURLを生成
  const metadataUrl = `/metadata/${metadataFileName}`;
  
  return {
    metadataFileName,
    metadataUrl
  };
}

// メタデータJSONの内容を生成する関数
export function generateMetadataContent(
  name: string,
  description: string,
  imageFileName: string
): string {
  // 画像のURLを指定（ホスト相対パス）
  const imageUrl = `/images/${imageFileName}`;
  
  // JSONメタデータオブジェクト
  const metadata = {
    name,
    description,
    image: imageUrl,
    attributes: [],
    created_at: new Date().toISOString()
  };
  
  // JSONをフォーマットして返す（読みやすさのために整形）
  return JSON.stringify(metadata, null, 2);
}

// Base64エンコードを使用した従来のメタデータURI生成関数（互換性のために残す）
export function generateNftUri(name: string, description: string, imageBase64: string): string {
  const metadata = {
    name,
    description,
    image: imageBase64,
  };
  
  // JSONをBase64に変換（Unicodeに対応）
  const jsonString = JSON.stringify(metadata);
  const base64 = unicodeToBase64(jsonString);
  
  // スキーマ付きのURIを返す
  return `data:application/json;base64,${base64}`;
}

// ファイルからNFTメタデータのJSONを生成（新しい関数）
export function createNftMetadataFromFile(
  file: File,
  name: string, 
  description: string
): { metadata: string, fileName: string } {
  // ファイル名を取得（拡張子を含む）
  const fileName = file.name;
  
  // JSONメタデータを生成
  const metadata = {
    name,
    description,
    image: `/images/${fileName}`,
    attributes: []
  };
  
  return {
    metadata: JSON.stringify(metadata),
    fileName
  };
}

// 許可するファイル形式（MIME Type）
export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml"
];

// ファイルサイズの上限（10MB）
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ファイルのバリデーション関数
export function validateFile(file: File): { valid: boolean; message?: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      message: "サポートされていないファイル形式です。JPEG、PNG、GIF、WEBP、またはSVGファイルを選択してください。",
    };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `ファイルサイズが大きすぎます。最大サイズは${MAX_FILE_SIZE / 1024 / 1024}MBです。`,
    };
  }
  
  return { valid: true };
} 