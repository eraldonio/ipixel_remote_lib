export class IPixelPreview {
    /**
     * Interactive Digital Twin Simulator Component
     * @param {HTMLElement} containerElement - The parent element to mount the previews
     * @param {Object} [options]
     * @param {number} [options.cols] - Grid columns (default: 1)
     * @param {number} [options.rows] - Grid rows (default: 1)
     * @param {Function} [options.onSwap] - Callback fired when display swap is triggered (passes swapped state)
     */
    constructor(containerElement, options = {}) {
        this.container = containerElement;
        this.cols = options.cols || 1;
        this.rows = options.rows || 1;
        this.onSwapCallback = options.onSwap || null;
        this.labelPrefix = options.labelPrefix || 'Screen';
        
        this.numSlots = this.cols * this.rows;
        this.cards = [];
        this.canvases = [];
        this.swapped = false;

        this.injectStyles();
        this.buildDOM();
    }

    injectStyles() {
        if (!document.getElementById('ipixel-preview-styles')) {
            const style = document.createElement('style');
            style.id = 'ipixel-preview-styles';
            style.textContent = `
                .ipixel-twin-wrapper {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    flex-shrink: 0;
                    perspective: 600px;
                    gap: 12px;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    width: 100%;
                }
                .ipixel-twin-wrapper.swapped {
                    flex-direction: row-reverse;
                }
                .ipixel-preview-card {
                    background: #000;
                    border-radius: 16px;
                    width: 140px;
                    height: 140px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(255, 159, 0, 0.15);
                    border: 4px solid #222;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    user-select: none;
                }
                .ipixel-preview-card canvas {
                    width: 100%;
                    height: 100%;
                    image-rendering: pixelated;
                    image-rendering: crisp-edges;
                    display: block;
                }
                .ipixel-display-label {
                    position: absolute;
                    top: 6px;
                    left: 6px;
                    background: rgba(0, 0, 0, 0.65);
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 8px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 8px;
                    pointer-events: none;
                    z-index: 10;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
            `;
            document.head.appendChild(style);
        }
    }

    buildDOM() {
        this.container.innerHTML = ''; // Clear previous content
        
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'ipixel-twin-wrapper';
        
        this.cards = [];
        this.canvases = [];
        
        for (let i = 0; i < this.numSlots; i++) {
            const card = document.createElement('div');
            card.className = 'ipixel-preview-card';
            card.id = `ipixel-preview-${i}`;
            if (i > 0) {
                card.style.display = 'none'; // Hide additional slots initially
            }

            const label = document.createElement('div');
            label.className = 'ipixel-display-label';
            label.textContent = `${this.labelPrefix} ${i + 1}`;
            card.appendChild(label);

            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            card.appendChild(canvas);

            this.wrapper.appendChild(card);
            this.cards.push(card);
            this.canvases.push(canvas);
        }

        this.container.appendChild(this.wrapper);
    }

    /**
     * Swap layout state visually and notify listeners
     */
    toggleSwap() {
        this.swapped = !this.swapped;
        if (this.swapped) {
            this.wrapper.classList.add('swapped');
        } else {
            this.wrapper.classList.remove('swapped');
        }
        if (this.onSwapCallback) {
            this.onSwapCallback(this.swapped);
        }
    }

    /**
     * Set explicit swapped configuration state
     * @param {boolean} isSwapped 
     */
    setSwapState(isSwapped) {
        this.swapped = !!isSwapped;
        if (this.swapped) {
            this.wrapper.classList.add('swapped');
        } else {
            this.wrapper.classList.remove('swapped');
        }
    }

    /**
     * Redraw the visual previews from the virtual display canvas
     * @param {HTMLCanvasElement} virtualCanvas - Reference virtual canvas
     */
    update(virtualCanvas) {
        if (!virtualCanvas) return;
        const ctxLeft = this.canvases[0].getContext('2d');
        ctxLeft.clearRect(0, 0, 32, 32);

        if (virtualCanvas.width === 64 && this.cards.length > 1) {
            this.cards[1].style.display = 'block';
            const ctxRight = this.canvases[1].getContext('2d');
            ctxRight.clearRect(0, 0, 32, 32);

            if (this.swapped) {
                // Visual left (canvas 1) gets Left image
                ctxRight.drawImage(virtualCanvas, 0, 0, 32, 32, 0, 0, 32, 32);
                // Visual right (canvas 0) gets Right image
                ctxLeft.drawImage(virtualCanvas, 32, 0, 32, 32, 0, 0, 32, 32);
            } else {
                // Visual left (canvas 0) gets Left image
                ctxLeft.drawImage(virtualCanvas, 0, 0, 32, 32, 0, 0, 32, 32);
                // Visual right (canvas 1) gets Right image
                ctxRight.drawImage(virtualCanvas, 32, 0, 32, 32, 0, 0, 32, 32);
            }
        } else {
            if (this.cards[1]) {
                this.cards[1].style.display = 'none';
            }
            // Copy entire canvas
            ctxLeft.drawImage(virtualCanvas, 0, 0, 32, 32, 0, 0, 32, 32);
        }
    }
}


