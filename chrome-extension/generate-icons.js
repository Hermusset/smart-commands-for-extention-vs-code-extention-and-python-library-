// Quick script to generate placeholder PNG icons
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');

// Minimal 16x16 PNG (blue-purple gradient placeholder)
// This is a valid minimal PNG file
function createMinimalPNG(size) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);  // width
    ihdrData.writeUInt32BE(size, 4);  // height
    ihdrData.writeUInt8(8, 8);        // bit depth
    ihdrData.writeUInt8(2, 9);        // color type (RGB)
    ihdrData.writeUInt8(0, 10);       // compression
    ihdrData.writeUInt8(0, 11);       // filter
    ihdrData.writeUInt8(0, 12);       // interlace

    const ihdr = createChunk('IHDR', ihdrData);

    // IDAT chunk - raw pixel data
    const rawData = [];
    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter type: None
        for (let x = 0; x < size; x++) {
            const t = (x + y) / (2 * size);
            // Blue to purple gradient
            const r = Math.round(88 + t * 100);
            const g = Math.round(166 - t * 40);
            const b = Math.round(255);
            rawData.push(r, g, b);
        }
    }

    // Simple deflate: store block
    const rawBuf = Buffer.from(rawData);
    const deflated = deflateStore(rawBuf);
    const idat = createChunk('IDAT', deflated);

    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeB = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeB, data]));
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([length, typeB, data, crcB]);
}

function deflateStore(data) {
    // Zlib header + store blocks
    const blocks = [];
    blocks.push(Buffer.from([0x78, 0x01])); // zlib header

    const maxBlock = 65535;
    let offset = 0;

    while (offset < data.length) {
        const remaining = data.length - offset;
        const blockSize = Math.min(remaining, maxBlock);
        const isLast = (offset + blockSize >= data.length) ? 1 : 0;

        const header = Buffer.alloc(5);
        header.writeUInt8(isLast, 0);
        header.writeUInt16LE(blockSize, 1);
        header.writeUInt16LE(blockSize ^ 0xFFFF, 3);

        blocks.push(header);
        blocks.push(data.slice(offset, offset + blockSize));
        offset += blockSize;
    }

    // Adler32 checksum
    const adler = adler32(data);
    const adlerB = Buffer.alloc(4);
    adlerB.writeUInt32BE(adler >>> 0, 0);
    blocks.push(adlerB);

    return Buffer.concat(blocks);
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return crc ^ 0xFFFFFFFF;
}

function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) {
        a = (a + buf[i]) % 65521;
        b = (b + a) % 65521;
    }
    return (b << 16) | a;
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach(size => {
    const png = createMinimalPNG(size);
    const filepath = path.join(iconsDir, `icon${size}.png`);
    fs.writeFileSync(filepath, png);
    console.log(`Created ${filepath} (${png.length} bytes)`);
});

console.log('\nIcons generated! You can replace them with custom icons later.');
