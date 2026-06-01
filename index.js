import { IPixelDevice } from './src/ipixel-device.js';
import { VirtualDisplay } from './src/virtual-display.js';
import * as TextEngine from './src/text-engine.js';
import * as Encoder from './src/encoder.js';
import { IPixelPreview } from './src/preview-component.js';

export {
    IPixelDevice,
    VirtualDisplay,
    TextEngine as PixelTextEngine,
    Encoder as iPixelEncoder,
    IPixelPreview
};

// --- Browser Direct Script Tag Global Namespace mapping ---
if (typeof window !== 'undefined') {
    window.iPixel = {
        Device: IPixelDevice,
        VirtualDisplay: VirtualDisplay,
        TextEngine: {
            wrapText: TextEngine.wrapText,
            getBestFontSize: TextEngine.getBestFontSize,
            drawCrispText: TextEngine.drawCrispText
        },
        Encoder: {
            crc32: Encoder.crc32,
            makeChunk: Encoder.makeChunk,
            generate32x32PNG: Encoder.generate32x32PNG,
            buildSendPlan: Encoder.buildSendPlan
        },
        Preview: IPixelPreview
    };
}
