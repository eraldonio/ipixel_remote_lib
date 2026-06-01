import { buildSendPlan } from './encoder.js';

// Helper to normalize and get 4-character short UUID string
function getShortUUID(uuid) {
    if (!uuid) return '';
    const normalized = uuid.toLowerCase();
    if (normalized.includes('-')) {
        const firstPart = normalized.split('-')[0];
        return firstPart.length === 8 ? firstPart.substring(4) : firstPart;
    }
    return normalized.padStart(4, '0').slice(-4);
}

export class IPixelDevice {
    constructor(options = {}) {
        this.device = null;
        this.gattServer = null;
        this.writeChar = null;
        this.notifyChar = null;
        this.connected = false;
        this.ackResolver = null;
        this.activeAckToken = null;
        this.connecting = false;
        this.onDisconnectCallback = null;
        this.chunkSize = options.chunkSize || 244;
        this.queue = Promise.resolve(); // Promise command queue
        this._onDisconnect = null;
        this._onNotification = null;
    }

    /**
     * Enqueue BLE commands sequentially.
     */
    async _enqueue(operation) {
        const next = this.queue.then(async () => {
            try {
                return await operation();
            } catch (err) {
                console.error("BLE Queue execution error:", err);
                throw err;
            }
        });
        this.queue = next.catch(() => {}); // Prevent chain breakdown on failure
        return next;
    }

    /**
     * Connect to a nearby iPixel LED display using Web Bluetooth.
     * @param {Object} [customOptions] - Web Bluetooth options (filters/services)
     */
    async connect(customOptions = {}) {
        if (this.connecting || this.connected) return;
        this.connecting = true;

        try {
            const servicesList = [
                '000000fa-0000-1000-8000-00805f9b34fb',
                '0000fa00-0000-1000-8000-00805f9b34fb',
                '0000fa01-0000-1000-8000-00805f9b34fb',
                '0000fa02-0000-1000-8000-00805f9b34fb',
                '0000fa03-0000-1000-8000-00805f9b34fb',
                '0000ae00-0000-1000-8000-00805f9b34fb',
                '0000ae01-0000-1000-8000-00805f9b34fb',
                '0000ae02-0000-1000-8000-00805f9b34fb',
                '0000ae10-0000-1000-8000-00805f9b34fb',
                '0000ae30-0000-1000-8000-00805f9b34fb',
                '00001800-0000-1000-8000-00805f9b34fb',
                '00001801-0000-1000-8000-00805f9b34fb',
                '0000180a-0000-1000-8000-00805f9b34fb'
            ];
            
            const options = Object.assign({
                filters: [{ namePrefix: 'LED_BLE_' }],
                optionalServices: servicesList
            }, customOptions);

            this.device = await navigator.bluetooth.requestDevice(options);

            this._onDisconnect = () => this.handleDisconnect();
            this.device.addEventListener('gattserverdisconnected', this._onDisconnect);

            this.gattServer = await this.device.gatt.connect();
            
            // Wait 1.5s for service discovery initialization to prevent GATT channel conflicts
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const services = await this.gattServer.getPrimaryServices();
            
            let targetService = null;
            let targetWriteChar = null;
            let targetNotifyChar = null;
            for (const s of services) {
                const shortUUID = getShortUUID(s.uuid);
                
                if (shortUUID === 'ae00' || shortUUID === 'fa00' || shortUUID === '00fa' || shortUUID.startsWith('fa')) {
                    try {
                        const characteristics = await s.getCharacteristics();
                        let foundWrite = null;
                        let foundNotify = null;
                        for (const c of characteristics) {
                            const cUUID = getShortUUID(c.uuid);
                            if (cUUID === 'fa02' || cUUID === 'ae01') {
                                foundWrite = c;
                            }
                            if (cUUID === 'fa03' || cUUID === 'ae02') {
                                foundNotify = c;
                            }
                        }
                        
                        if (foundWrite && foundNotify) {
                            targetWriteChar = foundWrite;
                            targetNotifyChar = foundNotify;
                            targetService = s;
                            if (shortUUID === '00fa' || shortUUID === 'fa00') {
                                break; // Prioritize fa00/00fa service
                            }
                        }
                    } catch (err) {
                        console.warn("Characteristic query error in service " + shortUUID, err);
                    }
                }
            }

            if (!targetService || !targetWriteChar || !targetNotifyChar) {
                throw new Error("Required iPixel GATT characteristics not found.");
            }
            
            this.writeChar = targetWriteChar;
            this.notifyChar = targetNotifyChar;
            
            // Handle notification events
            this._onNotification = (e) => {
                const view = e.target.value;
                const val = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                if (val.length >= 5 && val[0] === 0x05) {
                    const b4 = val[4];
                    if (b4 === 0 || b4 === 1 || b4 === 3) {
                        if (this.ackResolver) {
                            this.ackResolver();
                        }
                    }
                }
            };
            this.notifyChar.addEventListener('characteristicvaluechanged', this._onNotification);
            
            await this.notifyChar.startNotifications();
            this.connected = true;
            this.connecting = false;

            // Sync hardware time to exit default pairing screen
            await this.syncTime();

            // Set standard brightness
            await this.setBrightness(70);

        } catch (err) {
            this.handleDisconnect();
            throw err;
        }
    }

    handleDisconnect() {
        this.connected = false;
        this.connecting = false;
        if (this.device && this._onDisconnect) {
            this.device.removeEventListener('gattserverdisconnected', this._onDisconnect);
        }
        if (this.notifyChar && this._onNotification) {
            this.notifyChar.removeEventListener('characteristicvaluechanged', this._onNotification);
        }
        this.writeChar = null;
        this.notifyChar = null;
        this.ackResolver = null;
        this.activeAckToken = null;
        this.queue = Promise.resolve(); // Clear command queue
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback(this);
        }
    }

    /**
     * Close GATT connection manually
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
    }

    /**
     * Write raw bytes to iPixel GATT channel. Handles response-less writes with backoffs.
     * @param {Uint8Array} payload 
     */
    async writeValue(payload) {
        try {
            const canWrite = this.writeChar.properties.write;
            const canWriteWithoutResponse = this.writeChar.properties.writeWithoutResponse;
            if (canWriteWithoutResponse && !canWrite) {
                await this.writeChar.writeValueWithoutResponse(payload);
                await new Promise(resolve => setTimeout(resolve, 25));
            } else {
                await this.writeChar.writeValueWithResponse(payload);
            }
        } catch (e) {
            await this.writeChar.writeValueWithoutResponse(payload);
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    }

    /**
     * Helper to wait for the device to ACK the active transaction command.
     * Uses unique Symbol tokens to prevent cross-command race conditions on timeouts.
     * @private
     */
    async _waitForAck(timeoutMs = 3000) {
        const token = Symbol('ack');
        this.activeAckToken = token;
        
        return new Promise((resolve) => {
            const localAckResolver = () => {
                if (this.activeAckToken === token) {
                    this.activeAckToken = null;
                    this.ackResolver = null;
                    resolve();
                }
            };
            this.ackResolver = localAckResolver;
            setTimeout(() => {
                if (this.activeAckToken === token) {
                    this.activeAckToken = null;
                    this.ackResolver = null;
                    resolve(); // Timeout fallback
                }
            }, timeoutMs);
        });
    }

    /**
     * Sync local system time to display.
     */
    async syncTime() {
        if (!this.connected) return;
        return this._enqueue(async () => {
            const now = new Date();
            const payload = new Uint8Array([
                8,                 // Command length
                0,                 // Reserved
                1,                 // Sub-command
                0x80,              // Command type ID
                now.getHours(),
                now.getMinutes(),
                now.getSeconds(),
                0                  // Language
            ]);
            
            const ackPromise = this._waitForAck(3000);
            await this.writeValue(payload);
            await ackPromise;
        });
    }

    /**
     * Set display brightness
     * @param {number} level - Brightness level (0-100)
     */
    async setBrightness(level) {
        if (typeof level !== 'number' || level < 0 || level > 100) {
            throw new Error("Brightness level must be a number between 0 and 100.");
        }
        if (!this.connected) return;
        return this._enqueue(async () => {
            const payload = new Uint8Array([5, 0, 4, 0x80, level]);
            const ackPromise = this._waitForAck(4000);
            await this.writeValue(payload);
            await ackPromise;
        });
    }

    /**
     * Write a 32x32 PNG file to the display
     * @param {Uint8Array} pngBytes 
     */
    async sendImage(pngBytes) {
        if (!this.connected) return;
        return this._enqueue(async () => {
            const message = buildSendPlan(pngBytes);
            const chunk_size = this.chunkSize;

            const ackPromise = this._waitForAck(3000);

            for (let i = 0; i < message.length; i += chunk_size) {
                const chunk = message.subarray(i, i + chunk_size);
                await this.writeValue(chunk);
            }

            await ackPromise;
        });
    }
}

