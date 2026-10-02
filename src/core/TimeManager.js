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
            return 0;
        }

        if (this.lastTimestamp === 0) {
            this.lastTimestamp = timestamp;
            return 0;
        }
        
        // Calculate raw delta time
        this.deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        
        // Cap delta time to prevent spiral of death on background tab switches or massive stalls
        const maxDeltaTime = 100; // Cap to max 100ms
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
        
        // If using fixed timestep, return exactly how many fixed 60Hz steps have elapsed
        if (CONFIG.USE_FIXED_TIMESTEP) {
            this.accumulator += cappedDeltaTime;
            
            let steps = 0;
            const maxStepsPerFrame = 4; // Catch up at most 4 steps per frame (~66.7ms physics)
            while (this.accumulator >= this.fixedDeltaTime && steps < maxStepsPerFrame) {
                this.accumulator -= this.fixedDeltaTime;
                steps++;
            }
            
            // Discard excess lag only if accumulator is still backlogged beyond 2 frames
            if (this.accumulator > this.fixedDeltaTime * 2) {
                this.accumulator = 0;
            }
            
            // Return actual steps (0 when less than 16.67ms elapsed, 1 when one step elapsed, etc.)
            // Never force Math.max(1, steps) which caused game speed to scale with lower ping/higher FPS
            return steps;
        }
        
        // Otherwise return the actual delta time bounded
        return Math.min(0.05, Math.max(0.005, cappedDeltaTime / 1000));
    }
    
    getFixedDeltaTime() {
        return (this.fixedDeltaTime || (1000 / 60)) / 1000;
    }
    
    getFps() {
        return this.fps;
    }
}

