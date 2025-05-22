import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが見つかりません' },
        { status: 400 }
      );
    }

    // 画像ファイルの保存処理
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ファイル名を生成（タイムスタンプを追加して一意性を確保）
    const originalName = file.name;
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const imageFileName = `${Date.now()}_${safeName}`;
    
    // Vercel環境では/tmpディレクトリを使用する
    const isVercelProduction = process.env.VERCEL === '1';
    
    // 画像の保存先ディレクトリの確認と作成
    let imagesDirectory;
    let metadataDirectory;
    let imageUrlBase;
    let metadataUrlBase;
    
    if (isVercelProduction) {
      // Vercel環境では一時ディレクトリを使用
      imagesDirectory = join('/tmp', 'images');
      metadataDirectory = join('/tmp', 'metadata');
      
      // URLは相対パスのままにする（クライアント側でAPI応答を処理する際に使用）
      imageUrlBase = `/images/${imageFileName}`;
      metadataUrlBase = `/metadata`;
    } else {
      // 開発環境ではpublicディレクトリを使用
      imagesDirectory = join(process.cwd(), 'public', 'images');
      metadataDirectory = join(process.cwd(), 'public', 'metadata');
      imageUrlBase = `/images/${imageFileName}`;
      metadataUrlBase = `/metadata`;
    }
    
    // ディレクトリが存在しない場合は作成
    if (!existsSync(imagesDirectory)) {
      await mkdir(imagesDirectory, { recursive: true });
    }
    
    if (!existsSync(metadataDirectory)) {
      await mkdir(metadataDirectory, { recursive: true });
    }

    // 画像ファイルを保存
    const imagePath = join(imagesDirectory, imageFileName);
    await writeFile(imagePath, buffer);
    
    // 画像をBase64エンコード
    const imageBase64 = buffer.toString('base64');
    const imageType = file.type || 'image/jpeg'; // デフォルトのMIMEタイプ
    const imageDataUri = `data:${imageType};base64,${imageBase64}`;
    
    // メタデータJSONを作成
    const metadataFileName = `${Date.now()}_metadata.json`;
    const metadataPath = join(metadataDirectory, metadataFileName);
    
    // メタデータオブジェクトの作成
    const metadata = {
      name,
      description,
      image: isVercelProduction ? imageDataUri : imageUrlBase, // Vercel環境ではBase64画像を使用
      created_at: new Date().toISOString()
    };
    
    // メタデータJSONを保存
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    // メタデータをJSON文字列として取得
    const metadataJson = JSON.stringify(metadata);
    
    // クライアントに返すURL
    const metadataUrl = `${metadataUrlBase}/${metadataFileName}`;

    // Vercel環境では、メタデータを直接レスポンスに含める
    if (isVercelProduction) {
      console.log('Vercel環境: 一時ファイルを作成しました', { 
        imagePath, 
        metadataPath,
        imageBase64Length: imageBase64.length
      });
      
      // メタデータ文字列を直接返す
      return NextResponse.json({
        success: true,
        imageUrl: imageDataUri, // Base64エンコードされた画像
        metadataUrl: metadataJson, // メタデータJSONを直接返す
        metadataRaw: metadataJson, // 直接使用できるメタデータ
        isVercelProduction: true
      });
    }

    return NextResponse.json({
      success: true,
      imageUrl: imageUrlBase,
      metadataUrl,
      metadataFileName
    });
    
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    return NextResponse.json(
      { error: 'ファイルのアップロードに失敗しました' },
      { status: 500 }
    );
  }
} 