// Offscreen Canvas Cache
let offscreenCanvas = null;
let offscreenCtx = null;

function getOffscreenContext(width) {
    if (!offscreenCanvas) {
        if (typeof document !== 'undefined') {
            offscreenCanvas = document.createElement('canvas');
            offscreenCtx = offscreenCanvas.getContext('2d');
        } else {
            throw new Error("DOM document context required for text rendering.");
        }
    }
    if (offscreenCanvas.width < width) {
        offscreenCanvas.width = width;
    }
    return offscreenCtx;
}

// Color Parser Cache
let colorCanvas = null;
let colorCtx = null;
const colorCache = {};

function parseColorToRGB(color) {
    if (colorCache[color]) {
        return colorCache[color];
    }
    if (typeof document !== 'undefined') {
        if (!colorCanvas) {
            colorCanvas = document.createElement('canvas');
            colorCanvas.width = 1;
            colorCanvas.height = 1;
            colorCtx = colorCanvas.getContext('2d');
        }
        colorCtx.fillStyle = color;
        colorCtx.fillRect(0, 0, 1, 1);
        const imgData = colorCtx.getImageData(0, 0, 1, 1);
        const rgb = {
            r: imgData.data[0],
            g: imgData.data[1],
            b: imgData.data[2]
        };
        colorCache[color] = rgb;
        return rgb;
    }
    return { r: 255, g: 255, b: 255 };
}

/**
 * Split text into lines based on a maximum character count per line.
 * @param {string} text - Input text string
 * @param {number} [maxChars] - Maximum characters per line (default: 6)
 * @returns {string[]} Wrapped lines array (max 5 lines)
 */
export function wrapText(text, maxChars = 6) {
    const safeMaxChars = Math.max(1, maxChars);
    const words = text.split(' ');
    let lines = [];
    let currentLine = [];
    let currentLen = 0;

    for (let word of words) {
        if (word.length > safeMaxChars) {
            if (currentLine.length) {
                lines.push(currentLine.join(' '));
                currentLine = [];
                currentLen = 0;
            }
            for (let i = 0; i < word.length; i += safeMaxChars) {
                lines.push(word.substring(i, i + safeMaxChars));
            }
            continue;
        }
        const space = currentLine.length ? 1 : 0;
        if (currentLen + space + word.length <= safeMaxChars) {
            currentLine.push(word);
            currentLen += space + word.length;
        } else {
            lines.push(currentLine.join(' '));
            currentLine = [word];
            currentLen = word.length;
        }
    }
    if (currentLine.length) lines.push(currentLine.join(' '));
    return lines.slice(0, 5);
}

/**
 * Dynamically find the largest Silkscreen font size that fits the constraints.
 * @param {CanvasRenderingContext2D} ctx - Drawing context
 * @param {string} text - Text string to fit
 * @param {number} maxWidth - Target bounding box width
 * @param {number} maxHeight - Target bounding box height
 * @returns {number} Optimal size in pixels (ranges between 8 and 24)
 */
export function getBestFontSize(ctx, text, maxWidth = 32, maxHeight = 32) {
    const startSize = Math.min(24, maxHeight);
    for (let size = startSize; size >= 8; size--) {
        ctx.font = `${size}px Silkscreen, monospace`;
        const metrics = ctx.measureText(text);
        const w = Math.ceil(metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft);
        const h = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
        if (w <= maxWidth && h <= maxHeight) {
            return size;
        }
    }
    return 8;
}

/**
 * Draw 1-bit thresholded crisp text without any antialiasing artifacts.
 * @param {CanvasRenderingContext2D} ctx - Target canvas rendering context
 * @param {string} text - Text string
 * @param {number} size - Font size in pixels
 * @param {string} color - CSS hex or color name
 * @param {number} targetY - Top coordinate offset
 * @param {number} targetHeight - Draw region height
 */
export function drawCrispText(ctx, text, size, color, targetY, targetHeight) {
    const targetWidth = ctx.canvas.width;
    const tempCtx = getOffscreenContext(targetWidth);
    const tempCanvas = tempCtx.canvas;
    
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.fillStyle = '#000000';
    tempCtx.fillRect(0, 0, targetWidth, 32);
    
    tempCtx.font = `${size}px Silkscreen, monospace`;
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.textAlign = 'left';
    tempCtx.textBaseline = 'alphabetic';
    
    const metrics = tempCtx.measureText(text);
    const w = Math.ceil(metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft);
    const h = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
    
    const startX = Math.floor((targetWidth - w) / 2);
    const startY = targetY + Math.floor((targetHeight - h) / 2);
    
    const x = startX + Math.floor(metrics.actualBoundingBoxLeft);
    const y = startY + Math.floor(metrics.actualBoundingBoxAscent);
    
    tempCtx.fillText(text, x, y);
    
    const imgData = tempCtx.getImageData(0, 0, targetWidth, 32);
    const data = imgData.data;
    
    const targetImgData = ctx.getImageData(0, 0, targetWidth, ctx.canvas.height);
    const targetData = targetImgData.data;
    const rgb = parseColorToRGB(color);
    
    let modified = false;
    for (let py = targetY; py < targetY + targetHeight; py++) {
        if (py >= ctx.canvas.height || py >= 32) break;
        for (let px = 0; px < targetWidth; px++) {
            const idx = (py * targetWidth + px) * 4;
            if (data[idx] > 128) {
                targetData[idx] = rgb.r;
                targetData[idx + 1] = rgb.g;
                targetData[idx + 2] = rgb.b;
                targetData[idx + 3] = 255;
                modified = true;
            }
        }
    }
    
    if (modified) {
        ctx.putImageData(targetImgData, 0, 0);
    }
}
