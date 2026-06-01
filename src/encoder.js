// Precompute CRC32 lookup table once at module scope
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    return table;
})();

/**
 * CRC32 Checksum Helper
 * @param {Uint8Array} uint8Array
 * @returns {number} 32-bit unsigned CRC checksum
 */
export function crc32(uint8Array) {
    let crc = 0 ^ -1;
    for (let i = 0; i < uint8Array.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ uint8Array[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
}

/**
 * Creates a standard PNG Chunk (Length + Type + Data + CRC32)
 * @param {string} typeStr - 4-character chunk type (e.g. "IHDR")
 * @param {Uint8Array|null} data - Chunk payload
 * @returns {Uint8Array} Formatted chunk bytes
 */
export function makeChunk(typeStr, data) {
    const typeBytes = new TextEncoder().encode(typeStr);
    const len = data ? data.length : 0;
    const buf = new Uint8Array(4 + 4 + len + 4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, len, false); // Length big-endian
    buf.set(typeBytes, 4);
    if (data) buf.set(data, 8);
    const crcInput = buf.subarray(4, 8 + len);
    const crcVal = crc32(crcInput);
    view.setUint32(8 + len, crcVal, false); // CRC big-endian
    return buf;
}

/**
 * Encodes a 32x32 raw pixel array into standard 24-bit RGB PNG bytes in-memory
 * @param {Uint8ClampedArray|Uint8Array} pixels - Raw pixel values (RGBA, 4096 bytes)
 * @returns {Promise<Uint8Array>} PNG binary file bytes
 */
export async function generate32x32PNG(pixels) {
    if (!pixels || pixels.length < 4096) {
        throw new Error("Pixel buffer must contain at least 4096 bytes (32x32 RGBA pixels).");
    }

    const rawData = new Uint8Array(32 * 97);

    let writePos = 0;
    for (let y = 0; y < 32; y++) {
        rawData[writePos++] = 0; // Filter Type: None
        for (let x = 0; x < 32; x++) {
            const readPos = (y * 32 + x) * 4;
            rawData[writePos++] = pixels[readPos];
            rawData[writePos++] = pixels[readPos + 1];
            rawData[writePos++] = pixels[readPos + 2];
        }
    }

    // Compress using native CompressionStream ('deflate' generates standard zlib format)
    const stream = new Response(rawData).body.pipeThrough(new CompressionStream('deflate'));
    const compressedBuffer = await new Response(stream).arrayBuffer();
    const zlibStream = new Uint8Array(compressedBuffer);

    const ihdrData = new Uint8Array(13);
    const view = new DataView(ihdrData.buffer);
    view.setUint32(0, 32, false);
    view.setUint32(4, 32, false);
    ihdrData[8] = 8;
    ihdrData[9] = 2; // RGB (No Alpha)
    ihdrData[10] = 0;
    ihdrData[11] = 0;
    ihdrData[12] = 0;

    const ihdrChunk = makeChunk('IHDR', ihdrData);
    const idatChunk = makeChunk('IDAT', zlibStream);
    const iendChunk = makeChunk('IEND', null);

    const pngSignature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const pngBytes = new Uint8Array(pngSignature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
    let offset = 0;
    pngBytes.set(pngSignature, offset); offset += pngSignature.length;
    pngBytes.set(ihdrChunk, offset); offset += ihdrChunk.length;
    pngBytes.set(idatChunk, offset); offset += idatChunk.length;
    pngBytes.set(iendChunk, offset); offset += iendChunk.length;

    return pngBytes;
}

/**
 * Builds the binary iPixel transport frame containing command, size, CRC, and PNG bytes
 * @param {Uint8Array} pngBytes - PNG binary bytes
 * @param {number} saveSlot - Slot index (e.g. 0)
 * @returns {Uint8Array} Compiled BLE packet message
 */
export function buildSendPlan(pngBytes, saveSlot = 0) {
    const sizeBytes = new Uint8Array(4);
    new DataView(sizeBytes.buffer).setUint32(0, pngBytes.length, true);
    
    const crcVal = crc32(pngBytes);
    const crcBytes = new Uint8Array(4);
    new DataView(crcBytes.buffer).setUint32(0, crcVal, true);

    const header = new Uint8Array(13);
    header[0] = 0x02; // Image command type ID
    header[1] = 0x00;
    header[2] = 0x00; // Option: first frame
    header.set(sizeBytes, 3);
    header.set(crcBytes, 7);
    header[11] = 0x00;
    header[12] = saveSlot;

    const frameContent = new Uint8Array(header.length + pngBytes.length);
    frameContent.set(header, 0);
    frameContent.set(pngBytes, header.length);

    const frameLen = frameContent.length + 2;
    const prefix = new Uint8Array(2);
    new DataView(prefix.buffer).setUint16(0, frameLen, true);

    const message = new Uint8Array(prefix.length + frameContent.length);
    message.set(prefix, 0);
    message.set(frameContent, prefix.length);

    return message;
}
