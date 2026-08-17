const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ─── PNG Helpers ──────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ─── Create RGBA PNG ─────────────────────────────────────────
function createRGBA_PNG(width, height, paintFn) {
  // IHDR: color type 6 = RGBA
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixel data: each row = 1 filter byte + width * 4 bytes (RGBA)
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      // Default: fully transparent
      raw[px]     = 0;   // R
      raw[px + 1] = 0;   // G
      raw[px + 2] = 0;   // B
      raw[px + 3] = 0;   // A (transparent)
    }
  }

  // Let the paint function draw onto the buffer
  const setPixel = (x, y, r, g, b, a) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const rowStart = y * (1 + width * 4);
    const px = rowStart + 1 + x * 4;
    raw[px]     = r;
    raw[px + 1] = g;
    raw[px + 2] = b;
    raw[px + 3] = a;
  };

  paintFn(setPixel, width, height);

  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// ─── Create RGB PNG (no alpha) ────────────────────────────────
function createRGB_PNG(width, height, paintFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
  }

  const setPixel = (x, y, r, g, b) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const rowStart = y * (1 + width * 3);
    const px = rowStart + 1 + x * 3;
    raw[px]     = r;
    raw[px + 1] = g;
    raw[px + 2] = b;
  };

  paintFn(setPixel, width, height);

  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// ─── Draw a "U" shape (for "Unified") ────────────────────────
function drawU(setPixel, w, h, r, g, b, a) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const armH = Math.floor(h * 0.3);   // half-height of vertical arms
  const armW = Math.floor(w * 0.28);  // distance from center to arm
  const thick = Math.max(Math.floor(w * 0.1), 2); // stroke thickness
  const bottomY = cy + armH;
  const topY = cy - armH;

  // Left vertical arm
  for (let y = topY; y <= bottomY; y++) {
    for (let t = 0; t < thick; t++) {
      if (a !== undefined) setPixel(cx - armW + t, y, r, g, b, a);
      else setPixel(cx - armW + t, y, r, g, b);
    }
  }

  // Right vertical arm
  for (let y = topY; y <= bottomY; y++) {
    for (let t = 0; t < thick; t++) {
      if (a !== undefined) setPixel(cx + armW - thick + 1 + t, y, r, g, b, a);
      else setPixel(cx + armW - thick + 1 + t, y, r, g, b);
    }
  }

  // Bottom curve (horizontal + rounded corners)
  for (let x = cx - armW; x <= cx + armW; x++) {
    for (let t = 0; t < thick; t++) {
      if (a !== undefined) setPixel(x, bottomY - thick + 1 + t, r, g, b, a);
      else setPixel(x, bottomY - thick + 1 + t, r, g, b);
    }
  }
}

// ═════════════════════════════════════════════════════════════
//  Generate color.png — 192x192 RGB, navy bg with white U
// ═════════════════════════════════════════════════════════════
const colorPng = createRGB_PNG(192, 192, (setPixel, w, h) => {
  // Fill navy background
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      setPixel(x, y, 0, 30, 87); // #001E57
    }
  }
  // Draw white U
  drawU(setPixel, w, h, 255, 255, 255);
});

const colorPath = path.join(__dirname, 'manifest', 'color.png');
fs.writeFileSync(colorPath, colorPng);
console.log('color.png:', colorPng.length, 'bytes (192x192 RGB, navy bg + white U)');

// ═════════════════════════════════════════════════════════════
//  Generate outline.png — 32x32 RGBA, transparent bg + white U
//  Teams requirement: ONLY white (#FFFFFF) pixels, rest transparent
// ═════════════════════════════════════════════════════════════
const outlinePng = createRGBA_PNG(32, 32, (setPixel, w, h) => {
  // Background is already transparent (default)
  // Draw white U with full opacity
  drawU(setPixel, w, h, 255, 255, 255, 255);
});

const outlinePath = path.join(__dirname, 'manifest', 'outline.png');
fs.writeFileSync(outlinePath, outlinePng);
console.log('outline.png:', outlinePng.length, 'bytes (32x32 RGBA, transparent bg + white U)');

// ─── Verify outline has correct format ────────────────────────
const verify = fs.readFileSync(outlinePath);
const ihdrOffset = 8 + 4 + 4; // sig + length + type
const colorType = verify[ihdrOffset + 9];
console.log('\nVerification:');
console.log('  outline.png color type:', colorType, colorType === 6 ? '(RGBA - correct!)' : '(WRONG!)');
console.log('  Background: transparent (A=0)');
console.log('  Icon pixels: white (R=255, G=255, B=255, A=255)');
