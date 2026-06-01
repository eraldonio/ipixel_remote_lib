import { generate32x32PNG } from './encoder.js';

export class VirtualDisplay {
    /**
     * Coordinate grid manager for treating multiple iPixel displays as one unified canvas.
     * @param {Object} [options]
     * @param {number} [options.cols] - Number of displays horizontally (default: 1)
     * @param {number} [options.rows] - Number of displays vertically (default: 1)
     */
    constructor(options = {}) {
        this.cols = options.cols || 1;
        this.rows = options.rows || 1;
        
        // Logical virtual canvas spanning the entire resolution grid
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.cols * 32;
        this.canvas.height = this.rows * 32;
        
        // Array of device slots
        this.numSlots = this.cols * this.rows;
        this.devices = new Array(this.numSlots).fill(null);
        
        // Device slots maps screen slots to visual canvas slots.
        // deviceSlots[visualSlotIndex] = physicalDeviceIndex
        this.deviceSlots = Array.from({ length: this.numSlots }, (_, i) => i);
    }

    /**
     * Register a physical iPixelDevice instance to a index slot
     * @param {number} index - The zero-based index of connection order
     * @param {IPixelDevice} device - Connected device instance
     */
    registerDevice(index, device) {
        if (index < 0 || index >= this.numSlots) {
            throw new Error(`Device index ${index} exceeds display grid bounds.`);
        }
        this.devices[index] = device;
    }

    /**
     * Swap the physical output mapping of two displays (e.g. swap left and right)
     * @param {number} slotA 
     * @param {number} slotB 
     */
    swapSlots(slotA, slotB) {
        if (slotA < 0 || slotA >= this.numSlots || slotB < 0 || slotB >= this.numSlots) {
            return;
        }
        const temp = this.deviceSlots[slotA];
        this.deviceSlots[slotA] = this.deviceSlots[slotB];
        this.deviceSlots[slotB] = temp;
    }

    /**
     * Reset mapping back to default 1-to-1 order
     */
    resetSlots() {
        this.deviceSlots = Array.from({ length: this.numSlots }, (_, i) => i);
    }

    /**
     * Helper to check if swap has been modified from default configuration.
     * @returns {boolean} True if order is reversed/swapped
     */
    isSwapped() {
        for (let i = 0; i < this.numSlots; i++) {
            if (this.deviceSlots[i] !== i) return true;
        }
        return false;
    }

    /**
     * Get the rendering canvas context for drawing.
     * @returns {CanvasRenderingContext2D}
     */
    getCanvasContext() {
        const ctx = this.canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        return ctx;
    }

    /**
     * Slice the virtual canvas and transmit the individual 32x32 frames to displays in parallel.
     * @returns {Promise<void>} Resolves when all writes are complete (or timed out)
     */
    async sync() {
        const ctx = this.canvas.getContext('2d');
        const slicePromises = [];

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const visualSlotIdx = row * this.cols + col;
                
                // Extract 32x32 slice from coordinates
                const xOffset = col * 32;
                const yOffset = row * 32;
                const imgData = ctx.getImageData(xOffset, yOffset, 32, 32);
                
                // Map visual slot to target physical device based on configuration mapping
                const deviceIndex = this.deviceSlots[visualSlotIdx];
                const device = this.devices[deviceIndex];

                if (device && device.connected) {
                    const sendPromise = (async () => {
                        try {
                            const pngBytes = await generate32x32PNG(imgData.data);
                            await device.sendImage(pngBytes);
                        } catch (err) {
                            console.error(`GATT transmission failed on device ${deviceIndex}:`, err);
                        }
                    })();
                    slicePromises.push(sendPromise);
                }
            }
        }

        // Wait for all displays to draw concurrently. Individual failures will not reject the loop.
        await Promise.all(slicePromises);
    }
}
