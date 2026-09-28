import { CONFIG } from './config.js';

export class TimeManager {
    constructor() {
        this.lastTimestamp = 0;
        this.deltaTime = 0;
        this.fixedDeltaTime = CONFIG.TIME_STEP || (1000 / 60);
        this.accumulator = 0;
        this.frameCount = 0;
        this.fpsUpdateInterval = 500; // Update FPS display every 500ms
        this.lastFpsUpdate = 0;
        this.fps = 60;
    }
    
    update(timestamp) {
        if (!Number.isFinite(timestamp)) {
            return 1;
        }

        if (this.lastTimestamp === 0) {
            this.lastTimestamp = timestamp;
            return 1;
        }
        
        // Calculate raw delta time
        this.deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        
        // Cap delta time to prevent spiral of death on lag spikes or background tab switches
        const maxDeltaTime = 66.67; // Cap to max 2 steps per frame (~15 FPS min)
        const cappedDeltaTime = Math.min(Math.max(0, this.deltaTime), maxDeltaTime);
        
        // Update FPS counter
        this.frameCount++;
        if (timestamp - this.lastFpsUpdate > this.fpsUpdateInterval) {
            const elapsed = (timestamp - this.lastFpsUpdate) / 1000;
            if (elapsed > 0) {
                this.fps = Math.round(this.frameCount / elapsed);
            }
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
        }
        
        // If using fixed timestep, return how many fixed steps to take
        if (CONFIG.USE_FIXED_TIMESTEP) {
            this.accumulator += cappedDeltaTime;
            
            let steps = 0;
            while (this.accumulator >= this.fixedDeltaTime && steps < 2) {
                this.accumulator -= this.fixedDeltaTime;
                steps++;
            }
            
            // Discard excess lag to prevent death spirals
            if (this.accumulator > this.fixedDeltaTime) {
                this.accumulator = 0;
            }
            
            return Math.max(1, steps);
        }
        
        // Otherwise return the actual delta time bounded
        return Math.min(0.05, Math.max(0.005, cappedDeltaTime / 1000));
    }
    
    getFixedDeltaTime() {
        return Math.min(0.033, Math.max(0.01, (this.fixedDeltaTime || (1000 / 60)) / 1000));
    }
    
    getFps() {
        return this.fps;
    }
}

