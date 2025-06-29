const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC_SVG_PATH = path.join(__dirname, 'public', 'mountain.svg');
const OUTPUT_DIR = path.join(__dirname, 'public');

// ブランドカラーとアイコン用カラー
const BRAND_BG = '#0F172A'; // 背景色 (ダークネイビー)
const ICON_STROKE = '#10B981'; // 山のライン色 (エメラルド)

// SVG を読み込み、stroke 色を置換
const rawSvg = fs.readFileSync(SRC_SVG_PATH, 'utf8');
const svgForIcon = rawSvg.replace(/stroke="#[0-9a-fA-F]{6}"/, `stroke="${ICON_STROKE}"`);

// sharp はバッファを受け取れる
const svgBuffer = Buffer.from(svgForIcon);

if (!fs.existsSync(SRC_SVG_PATH)) {
  console.error('❌ mountain.svg が見つかりません');
  process.exit(1);
}

/**
 * 指定サイズで PNG アイコンを生成
 * @param {number} size - アイコンの一辺（px）
 * @param {string} filename - 出力ファイル名
 */
async function generate(size, filename) {
  const outputPath = path.join(OUTPUT_DIR, filename);
  await sharp(svgBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: BRAND_BG, // ブランドカラー背景
    })
    .flatten({ background: BRAND_BG })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toFile(outputPath);
  console.log(`✅ ${filename} (${size}x${size}) 生成完了`);
}

(async () => {
  try {
    await generate(180, 'apple-touch-icon.png');
    await generate(192, 'icon-192.png');
    await generate(512, 'icon-512.png');
    console.log('🎉 すべてのアイコンを生成しました');
  } catch (err) {
    console.error('❌ アイコン生成エラー:', err);
    process.exit(1);
  }
})(); 