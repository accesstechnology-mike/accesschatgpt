const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputIcon = path.join(__dirname, '../public/img/icon.png');
const outputDir = path.join(__dirname, '../public');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Favicon sizes for web
const faviconSizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon-48x48.png' },
  { size: 64, name: 'favicon-64x64.png' },
];

// Apple touch icons (iOS)
const appleIconSizes = [
  { size: 60, name: 'apple-touch-icon-60x60.png' },
  { size: 76, name: 'apple-touch-icon-76x76.png' },
  { size: 120, name: 'apple-touch-icon-120x120.png' },
  { size: 152, name: 'apple-touch-icon-152x152.png' },
  { size: 167, name: 'apple-touch-icon-167x167.png' },
  { size: 180, name: 'apple-touch-icon-180x180.png' },
];

// Android icons
const androidIconSizes = [
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
];

// Generate ICO file (multi-resolution favicon.ico)
const icoSizes = [16, 32, 48];

async function generateFavicons() {
  try {
    console.log('Generating favicons from', inputIcon);
    
    // Check if input file exists
    if (!fs.existsSync(inputIcon)) {
      throw new Error(`Input icon not found: ${inputIcon}`);
    }

    // Generate web favicons
    console.log('Generating web favicons...');
    for (const { size, name } of faviconSizes) {
      await sharp(inputIcon)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(outputDir, name));
      console.log(`  ✓ Generated ${name}`);
    }

    // Generate Apple touch icons
    console.log('Generating Apple touch icons...');
    for (const { size, name } of appleIconSizes) {
      await sharp(inputIcon)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(outputDir, name));
      console.log(`  ✓ Generated ${name}`);
    }

    // Generate Android icons
    console.log('Generating Android icons...');
    for (const { size, name } of androidIconSizes) {
      await sharp(inputIcon)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(outputDir, name));
      console.log(`  ✓ Generated ${name}`);
    }

    // Generate favicon.ico (using 32x32 as primary)
    console.log('Generating favicon.ico...');
    await sharp(inputIcon)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'favicon.ico'));
    console.log(`  ✓ Generated favicon.ico`);

    // Generate apple-touch-icon.png (default, 180x180)
    await sharp(inputIcon)
      .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));
    console.log(`  ✓ Generated apple-touch-icon.png`);

    console.log('\n✅ All favicons generated successfully!');
  } catch (error) {
    console.error('Error generating favicons:', error);
    process.exit(1);
  }
}

generateFavicons();


