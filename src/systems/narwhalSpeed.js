import { CONFIG } from '../core/config.js';

export class NarwhalSpeed {
    constructor() {}
    
    // Apply speed modifier to narwhal's current speed
    applySpeedModifier(narwhal, currentSpeed) {
        // If narwhal has a speed modifier defined, apply it
        if (narwhal.speedModifier && narwhal.speedModifier > 1.0) {
            return currentSpeed * narwhal.speedModifier;
        }
        return currentSpeed;
    }
    
    // Initialize a new narwhal with default speed settings
    initializeNarwhal(narwhal) {
        // Set default speed modifier (1.0 = normal speed)
        narwhal.speedModifier = 1.0;
        narwhal.staminaCooldownModifier = 1.0;
    }
    
    // Update speed and cooldown settings based on upgrades
    updateSpeedSettings(narwhal) {
        if (narwhal.upgrades.speedBoost) {
            narwhal.speedModifier = CONFIG.SPEED_UPGRADE;
        }
        
        if (narwhal.upgrades.staminaCooldown1) {
            narwhal.staminaCooldownModifier = Math.min(narwhal.staminaCooldownModifier, CONFIG.STAMINA_COOLDOWN_UPGRADE_1);
        }
        
        if (narwhal.upgrades.staminaCooldown2) {
            narwhal.staminaCooldownModifier = Math.min(narwhal.staminaCooldownModifier, CONFIG.STAMINA_COOLDOWN_UPGRADE_2);
        }
        
        return narwhal;
    }
}