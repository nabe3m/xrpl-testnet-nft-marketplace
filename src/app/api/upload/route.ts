import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { put } from '@vercel/blob';

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

    // ファイル名を生成（タイムスタンプを追加して一意性を確保）
    const originalName = file.name;
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const imageFileName = `${Date.now()}_${safeName}`;
    
    // Vercel環境かどうかを判定
    const isVercelProduction = process.env.VERCEL === '1';
    const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
    
    // 画像URLとメタデータURL
    let imageUrl;
    let metadataUrl;
    let metadataJson;
    
    if (isVercelProduction && hasBlobToken) {
      console.log('Vercel Blob APIを使用してファイルをアップロード');
      
      // Vercel Blobに画像をアップロード
      const imageBlob = await put(imageFileName, file, {
        access: 'public',
      });
      
      // 画像のURLを取得
      imageUrl = imageBlob.url;
      
      // メタデータJSONを作成
      const metadata = {
        name,
        description,
        image: imageUrl,
        created_at: new Date().toISOString()
      };
      
      // メタデータJSONをシリアライズ
      metadataJson = JSON.stringify(metadata);
      
      // メタデータをVercel Blobにアップロード
      const metadataFileName = `${Date.now()}_metadata.json`;
      const metadataBlob = await put(metadataFileName, metadataJson, {
        access: 'public',
        contentType: 'application/json'
      });
      
      // メタデータのURLを取得
      metadataUrl = metadataBlob.url;
      
      console.log('Vercel Blobにアップロード完了', {
        imageUrl,
        metadataUrl
      });
      
      return NextResponse.json({
        success: true,
        imageUrl,
        metadataUrl,
        isVercelProduction: true,
        usingBlob: true
      });
      
    } else {
      // 開発環境では従来通りpublicディレクトリに保存
      console.log('ローカル環境: publicディレクトリに保存');
      
      // 画像の保存先ディレクトリの確認と作成
      const imagesDirectory = join(process.cwd(), 'public', 'images');
      const metadataDirectory = join(process.cwd(), 'public', 'metadata');
      
      if (!existsSync(imagesDirectory)) {
        await mkdir(imagesDirectory, { recursive: true });
      }
      
      if (!existsSync(metadataDirectory)) {
        await mkdir(metadataDirectory, { recursive: true });
      }
      
      // 画像ファイルの保存処理
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // 画像ファイルを保存
      const imagePath = join(imagesDirectory, imageFileName);
      await writeFile(imagePath, buffer);
      
      // 画像のURLを設定
      imageUrl = `/images/${imageFileName}`;
      
      // メタデータJSONを作成
      const metadataFileName = `${Date.now()}_metadata.json`;
      const metadataPath = join(metadataDirectory, metadataFileName);
      
      // メタデータオブジェクトの作成
      const metadata = {
        name,
        description,
        image: imageUrl,
        created_at: new Date().toISOString()
      };
      
      // メタデータJSONを保存
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      
      // メタデータJSONをシリアライズ
      metadataJson = JSON.stringify(metadata);
      
      // メタデータのURLを設定
      metadataUrl = `/metadata/${metadataFileName}`;
      
      return NextResponse.json({
        success: true,
        imageUrl,
        metadataUrl,
        metadataJson,
        isVercelProduction: false,
        usingBlob: false
      });
    }
    
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    return NextResponse.json(
      { error: 'ファイルのアップロードに失敗しました' },
      { status: 500 }
    );
  }
} 