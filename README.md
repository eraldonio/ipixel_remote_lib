# ipixel-remote

A client-side Web Bluetooth library for controlling one or more iPixel 32x32 LED displays as a unified grid display. Supports time/brightness configuration, real-time canvas slicing, concurrent BLE transfers, pixel font formatting, and interactive drag-to-rearrange preview screen rendering.

---

## Installation

### ES Modules
For bundling with build pipelines (e.g. Vite, Webpack, rollup):
```javascript
import { 
  IPixelDevice, 
  VirtualDisplay, 
  PixelTextEngine, 
  IPixelPreview 
} from './path/to/ipixel_remote_lib/index.js';
```

### Direct HTML Script Tag
Include the script directly into your page to expose the global `window.iPixel` object:
```html
<script src="./path/to/ipixel_remote_lib/index.js" type="module"></script>
<script>
  // Access elements on window.iPixel:
  const { Device, VirtualDisplay, TextEngine, Preview } = window.iPixel;
</script>
```
*Note: Make sure to include `type="module"` when importing `index.js` directly.*

---

## Core API Reference

### 1. `IPixelDevice`
Represents a connection session to a single physical display.

* **`new IPixelDevice()`**: Instantiates a new BLE controller.
* **`async connect(options = {})`**: Requests pairing for name prefix `LED_BLE_`. Sets notifications, syncs time, and initiates brightness to 70.
* **`disconnect()`**: Terminate GATT connection.
* **`async setBrightness(level)`**: Updates screen brightness (0-100).
* **`async syncTime()`**: Synchronizes display time with the system.
* **`async sendImage(pngBytes)`**: Transmits 32x32 PNG file payload with waiting ACKs.

---

### 2. `VirtualDisplay`
Grid layout coordinator spanning multiple displays.

* **`new VirtualDisplay({ cols, rows })`**: Setup layout configuration (default: 1x1). Exposes `this.canvas` at `(cols * 32) x (rows * 32)`.
* **`registerDevice(index, device)`**: Assigns a device to a connection index.
* **`swapSlots(slotA, slotB)`**: Swaps visual layouts to match physical ordering.
* **`getCanvasContext()`**: Returns canvas context for drawings.
* **`async sync()`**: Slices coordinate canvas and transmits PNG payloads in parallel.

---

### 3. `PixelTextEngine`
Crisp styling layouts for low-resolution displays.

* **`wrapText(text, maxChars)`**: Wraps a string into rows array.
* **`getBestFontSize(ctx, text, maxWidth, maxHeight)`**: Solves optimal font size between 8px and 24px.
* **`drawCrispText(ctx, text, size, color, targetY, targetHeight)`**: Renders 1-bit thresholded crisp text on a canvas.

---

### 4. `IPixelPreview`
Digital twin rendering wrapper with drag rearranged gestures.

* **`new IPixelPreview(container, { cols, rows, onSwap })`**: Builds twin DOM nodes inside the container.
* **`update(virtualCanvas)`**: Reads virtual canvas width, slices and repaints visual previews in real-time.
* **`setSwapState(bool)`**: Sets explicit visual swapped arrangement.

---

## Quickstart Integration Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>iPixel Example</title>
</head>
<body>
    <button id="connect-btn">Connect Display</button>
    <div id="preview-container"></div>

    <script type="module">
        import { IPixelDevice, VirtualDisplay, PixelTextEngine, IPixelPreview } from './index.js';

        const display = new VirtualDisplay({ cols: 2, rows: 1 });
        const preview = new IPixelPreview(document.getElementById('preview-container'), {
            cols: 2,
            rows: 1,
            onSwap: (swapped) => {
                display.swapSlots(0, 1);
                display.sync();
            }
        });

        document.getElementById('connect-btn').addEventListener('click', async () => {
            const dev = new IPixelDevice();
            await dev.connect();
            display.registerDevice(0, dev);
            
            // Draw a syllable
            const ctx = display.getCanvasContext();
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 64, 32);
            PixelTextEngine.drawCrispText(ctx, "CHI", 14, "#00FFFF", 8, 24);
            
            // Render on physical display & update twin preview
            await display.sync();
            preview.update(display.canvas);
        });
    </script>
</body>
</html>
```
