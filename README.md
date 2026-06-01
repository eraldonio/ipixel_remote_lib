# ipixel-remote

[![npm version](https://img.shields.io/npm/v/ipixel-remote)](https://www.npmjs.com/package/ipixel-remote)
[![npm downloads](https://img.shields.io/npm/dm/ipixel-remote)](https://www.npmjs.com/package/ipixel-remote)
[![license](https://img.shields.io/npm/l/ipixel-remote)](https://github.com/eraldonio/ipixel_remote_lib/blob/main/LICENSE)

A client-side **Web Bluetooth** library for controlling one or more iPixel 32x32 LED matrix displays as a unified grid display. Supports time/brightness configuration, real-time canvas slicing, concurrent BLE transfers, and pixel-perfect font rendering.

🌐 **[Live Demo](https://eraldonio.github.io/ipixel_remote_lib/demo.html)** — Try it in Chrome with a real iPixel device.

> **Note**: Web Bluetooth requires **Chrome, Edge, or Opera** on a desktop or Android device. HTTPS is required (except on `localhost`).

---

## Installation

### npm
```bash
npm install ipixel-remote
```

```javascript
import { IPixelDevice, VirtualDisplay, PixelTextEngine, IPixelPreview } from 'ipixel-remote';
```

### Direct HTML Script Tag
Include directly into a page to expose the global `window.iPixel` namespace:
```html
<script src="https://eraldonio.github.io/ipixel_remote_lib/index.js" type="module"></script>
<script>
  const { Device, VirtualDisplay, TextEngine, Preview } = window.iPixel;
</script>
```
*Note: Always include `type="module"` on the script tag.*

---

## Core API Reference

### 1. `IPixelDevice`
Represents a connection session to a single physical iPixel display.

| Method | Description |
|---|---|
| `new IPixelDevice(options?)` | Creates a new BLE controller. Accepts `{ chunkSize }` (default: `244`). |
| `async connect(options?)` | Opens a device picker filtered to `LED_BLE_` prefix. Syncs time and sets brightness to `70` on success. |
| `disconnect()` | Manually closes the GATT connection. |
| `async setBrightness(level)` | Sets display brightness. `level` must be a number between `0` and `100`. |
| `async syncTime()` | Synchronizes the display clock with the current system time. |
| `async sendImage(pngBytes)` | Transmits a 32x32 PNG `Uint8Array` to the display. |
| `onDisconnectCallback` | Optional callback `(device) => void` fired on disconnect. |

---

### 2. `VirtualDisplay`
Grid layout coordinator that treats multiple displays as one unified canvas.

| Method | Description |
|---|---|
| `new VirtualDisplay({ cols, rows })` | Creates a virtual grid. Exposes `this.canvas` at `(cols * 32) x (rows * 32)` pixels. |
| `registerDevice(index, device)` | Assigns a connected `IPixelDevice` to a slot index. |
| `swapSlots(slotA, slotB)` | Swaps the physical output mapping of two display slots. |
| `resetSlots()` | Resets slot mapping back to default 1-to-1 order. |
| `isSwapped()` | Returns `true` if the slot mapping has been modified from default. |
| `getCanvasContext()` | Returns the `CanvasRenderingContext2D` for drawing on the unified canvas. |
| `async sync()` | Slices the canvas and transmits individual 32x32 frames to each display in parallel. |

---

### 3. `PixelTextEngine`
Pixel-perfect text rendering for ultra-low resolution displays.

| Method | Description |
|---|---|
| `wrapText(text, maxChars?)` | Splits text into lines (max 5), fitting within `maxChars` per line (default: `6`). |
| `getBestFontSize(ctx, text, maxWidth, maxHeight)` | Returns the largest Silkscreen font size (8–24px) that fits the given bounds. |
| `drawCrispText(ctx, text, size, color, targetY, targetHeight)` | Renders 1-bit threshold-filtered crisp text directly on a canvas context. No anti-aliasing. |

---

### 4. `IPixelPreview`
Digital twin simulator component. Renders live previews of display output inside a DOM container.

| Method / Option | Description |
|---|---|
| `new IPixelPreview(container, options?)` | Mounts preview cards into `container`. |
| `options.cols` | Number of display columns (default: `1`). |
| `options.rows` | Number of display rows (default: `1`). |
| `options.labelPrefix` | Label prefix for each screen card (default: `"Screen"`). |
| `options.onSwap` | Callback `(isSwapped: boolean) => void` fired when the swap state changes. |
| `update(virtualCanvas)` | Reads virtual canvas width and repaints preview cards from the source canvas. |
| `toggleSwap()` | Programmatically toggles the visual swap state and fires `onSwap`. |
| `setSwapState(bool)` | Explicitly sets the visual swap state without firing `onSwap`. |

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
    <button id="swap-btn" style="display:none;">⇄ Swap</button>
    <div id="preview-container"></div>

    <script type="module">
        import { IPixelDevice, VirtualDisplay, PixelTextEngine, IPixelPreview } from 'ipixel-remote';

        const display = new VirtualDisplay({ cols: 2, rows: 1 });
        const preview = new IPixelPreview(document.getElementById('preview-container'), {
            cols: 2,
            rows: 1,
            labelPrefix: 'Display',
            onSwap: (isSwapped) => {
                display.swapSlots(0, 1);
            }
        });

        document.getElementById('connect-btn').addEventListener('click', async () => {
            const dev = new IPixelDevice();
            await dev.connect();
            display.registerDevice(0, dev);

            // Draw text on the unified canvas
            const ctx = display.getCanvasContext();
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 64, 32);
            PixelTextEngine.drawCrispText(ctx, 'HELLO', 14, '#00FFFF', 4, 24);

            // Send to physical display and update the preview twin
            await display.sync();
            preview.update(display.canvas);

            document.getElementById('swap-btn').style.display = 'inline';
        });

        document.getElementById('swap-btn').addEventListener('click', () => {
            preview.toggleSwap();
            display.sync();
        });
    </script>
</body>
</html>
```

---

## Browser Compatibility

| Platform | Browser | Supported |
|---|---|---|
| 🖥️ Windows / macOS / Linux | Chrome | ✅ Full support |
| 🖥️ Windows / macOS / Linux | Edge | ✅ Full support |
| 🖥️ Windows / macOS / Linux | Opera | ✅ Full support |
| 🖥️ Windows / macOS / Linux | Firefox | ❌ Not supported |
| 📱 Android | Chrome | ✅ Full support |
| 📱 Android | Samsung Internet | ⚠️ Partial support |
| 📱 Android | Firefox | ❌ Not supported |
| 🍎 iPhone / iPad (iOS) | Any browser | ❌ Not supported |

> [!NOTE]
> **Why does iOS not work?** Apple requires all browsers on iPhone and iPad to use the **WebKit** rendering engine under the hood. This means Chrome, Firefox, and Edge on iOS are all restricted to WebKit's capabilities — and WebKit does not implement the Web Bluetooth API. This is an Apple platform restriction, not a library limitation. The only path to iPhone support would be a native iOS app using Swift's `CoreBluetooth` framework.

---

## Links

- 📦 [npm package](https://www.npmjs.com/package/ipixel-remote)
- 🌐 [Live Demo](https://eraldonio.github.io/ipixel_remote_lib/demo.html)
- 🔧 [GitHub Repository](https://github.com/eraldonio/ipixel_remote_lib)
- 📋 [Releases & Changelog](https://github.com/eraldonio/ipixel_remote_lib/releases)

---

## License

MIT
