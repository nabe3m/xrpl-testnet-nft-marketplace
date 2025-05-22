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
    
    // 画像の保存先ディレクトリの確認と作成
    const imagesDirectory = join(process.cwd(), 'public', 'images');
    const metadataDirectory = join(process.cwd(), 'public', 'metadata');
    
    if (!existsSync(imagesDirectory)) {
      await mkdir(imagesDirectory, { recursive: true });
    }
    
    if (!existsSync(metadataDirectory)) {
      await mkdir(metadataDirectory, { recursive: true });
    }

    // 画像ファイルを保存
    const imagePath = join(imagesDirectory, imageFileName);
    await writeFile(imagePath, buffer);
    
    // メタデータJSONを作成
    const metadataFileName = `${Date.now()}_metadata.json`;
    const metadataPath = join(metadataDirectory, metadataFileName);
    
    // メタデータオブジェクトの作成
    const metadata = {
      name,
      description,
      image: `/images/${imageFileName}`,
      created_at: new Date().toISOString()
    };
    
    // メタデータJSONを保存
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    // クライアントに返すURL
    const metadataUrl = `/metadata/${metadataFileName}`;

    return NextResponse.json({
      success: true,
      imageUrl: `/images/${imageFileName}`,
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