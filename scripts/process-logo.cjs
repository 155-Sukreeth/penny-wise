const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\sukre_ix4q6yd\\.gemini\\antigravity-ide\\brain\\f5e9bf03-2249-4471-a63b-041f841f4f36\\.user_uploaded\\media_1788814709127.png';
const publicDir = path.join(__dirname, '..', 'public');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function process() {
  const metadata = await sharp(srcPath).metadata();
  console.log('Source Image dimensions:', metadata.width, 'x', metadata.height);

  const halfWidth = Math.floor(metadata.width / 2);
  const height = metadata.height;

  // 1. Left image (Black squircle icon)
  const leftBuffer = await sharp(srcPath)
    .extract({ left: 0, top: 0, width: halfWidth, height: height })
    .toBuffer();

  // 2. Right image (Round logo on white/transparent)
  const rightBuffer = await sharp(srcPath)
    .extract({ left: halfWidth, top: 0, width: metadata.width - halfWidth, height: height })
    .toBuffer();

  const appIconMaster = path.join(publicDir, 'app-icon.png');
  const logoMaster = path.join(publicDir, 'logo.png');

  // 1. Resize left icon into a clean 1024x1024 master icon
  await sharp(leftBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(appIconMaster);

  // 2. For the right logo, make outer white transparent
  const { data, info } = await sharp(rightBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const h = info.height;
  const channels = info.channels;
  const rgbaBuffer = Buffer.alloc(width * h * 4);

  for (let i = 0; i < width * h; i++) {
    rgbaBuffer[i * 4] = data[i * channels];
    rgbaBuffer[i * 4 + 1] = data[i * channels + 1];
    rgbaBuffer[i * 4 + 2] = data[i * channels + 2];
    rgbaBuffer[i * 4 + 3] = channels === 4 ? data[i * channels + 3] : 255;
  }

  const visited = new Uint8Array(width * h);
  const queue = [
    [0, 0], [width - 1, 0], [0, h - 1], [width - 1, h - 1],
    [Math.floor(width / 2), 0], [0, Math.floor(h / 2)], [width - 1, Math.floor(h / 2)], [Math.floor(width / 2), h - 1]
  ];

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    if (x < 0 || x >= width || y < 0 || y >= h) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const r = rgbaBuffer[idx * 4];
    const g = rgbaBuffer[idx * 4 + 1];
    const b = rgbaBuffer[idx * 4 + 2];

    if (r > 235 && g > 235 && b > 235) {
      rgbaBuffer[idx * 4 + 3] = 0;
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  await sharp(rgbaBuffer, { raw: { width, height: h, channels: 4 } })
    .png()
    .toFile(logoMaster);

  // Web & PWA assets
  await sharp(appIconMaster).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(appIconMaster).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(appIconMaster).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(logoMaster).resize(64, 64).png().toFile(path.join(publicDir, 'favicon.png'));

  // Android mipmap launcher icons
  const androidSizes = {
    'mipmap-mdpi': { launcher: 48, foreground: 108 },
    'mipmap-hdpi': { launcher: 72, foreground: 162 },
    'mipmap-xhdpi': { launcher: 96, foreground: 216 },
    'mipmap-xxhdpi': { launcher: 144, foreground: 324 },
    'mipmap-xxxhdpi': { launcher: 192, foreground: 432 },
  };

  for (const [folder, sizes] of Object.entries(androidSizes)) {
    const targetDir = path.join(resDir, folder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // ic_launcher (standard)
    await sharp(appIconMaster)
      .resize(sizes.launcher, sizes.launcher)
      .png()
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // ic_launcher_round
    await sharp(logoMaster)
      .resize(sizes.launcher, sizes.launcher, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    // ic_launcher_foreground for adaptive icon
    await sharp(logoMaster)
      .resize(Math.floor(sizes.foreground * 0.65), Math.floor(sizes.foreground * 0.65))
      .extend({
        top: Math.floor(sizes.foreground * 0.175),
        bottom: Math.ceil(sizes.foreground * 0.175),
        left: Math.floor(sizes.foreground * 0.175),
        right: Math.ceil(sizes.foreground * 0.175),
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .resize(sizes.foreground, sizes.foreground)
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));
  }

  // Update ic_launcher_background in both values/ and drawable/
  const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#000000"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;
  fs.writeFileSync(path.join(resDir, 'drawable', 'ic_launcher_background.xml'), bgXmlContent);
  fs.writeFileSync(path.join(resDir, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`);

  // Generate splash screens with PennyWise logo on pure black
  const splashSizes = {
    'drawable': { w: 480, h: 800 },
    'drawable-port-mdpi': { w: 320, h: 480 },
    'drawable-port-hdpi': { w: 480, h: 800 },
    'drawable-port-xhdpi': { w: 720, h: 1280 },
    'drawable-port-xxhdpi': { w: 960, h: 1600 },
    'drawable-port-xxxhdpi': { w: 1280, h: 1920 },
    'drawable-land-mdpi': { w: 480, h: 320 },
    'drawable-land-hdpi': { w: 800, h: 480 },
    'drawable-land-xhdpi': { w: 1280, h: 720 },
    'drawable-land-xxhdpi': { w: 1600, h: 960 },
    'drawable-land-xxxhdpi': { w: 1920, h: 1280 },
  };

  for (const [folder, dims] of Object.entries(splashSizes)) {
    const targetDir = path.join(resDir, folder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const logoSize = Math.min(dims.w, dims.h) * 0.35;
    const resizedLogo = await sharp(logoMaster)
      .resize(Math.round(logoSize), Math.round(logoSize))
      .toBuffer();

    await sharp({
      create: {
        width: dims.w,
        height: dims.h,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 }
      }
    })
    .composite([{ input: resizedLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(targetDir, 'splash.png'));
  }

  console.log('Successfully updated all Android launcher icons, drawables, splash screens, and web assets!');
}

process().catch(console.error);
