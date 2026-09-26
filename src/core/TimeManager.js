import { CONFIG } from './config.js';

export class TimeManager {
    constructor() {
        this.lastTimestamp = 0;
        this.deltaTime = 0;
        this.fixedDeltaTime = CONFIG.TIME_STEP;
        this.accumulator = 0;
        this.frameCount = 0;
        this.fpsUpdateInterval = 500; // Update FPS display every 500ms
        this.lastFpsUpdate = 0;
        this.fps = 0;
    }
    
    update(timestamp) {
        if (this.lastTimestamp === 0) {
            this.lastTimestamp = timestamp;
            return 0;
        }
        
        // Calculate raw delta time
        this.deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        
        // Cap delta time to prevent spiral of death on slow devices
        const maxDeltaTime = 100; // 100ms = minimum 10 FPS
        const cappedDeltaTime = Math.min(this.deltaTime, maxDeltaTime);
        
        // Update FPS counter
        this.frameCount++;
        if (timestamp - this.lastFpsUpdate > this.fpsUpdateInterval) {
            this.fps = Math.round(this.frameCount / ((timestamp - this.lastFpsUpdate) / 1000));
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
        }
        
        // If using fixed timestep, return how many fixed steps to take
        if (CONFIG.USE_FIXED_TIMESTEP) {
            this.accumulator += cappedDeltaTime;
            const steps = Math.floor(this.accumulator / this.fixedDeltaTime);
            this.accumulator -= steps * this.fixedDeltaTime;
            return steps;
        }
        
        // Otherwise return the actual delta time
        return cappedDeltaTime;
    }
    
    getFixedDeltaTime() {
        return this.fixedDeltaTime;
    }
    
    getFps() {
        return this.fps;
    }
}
