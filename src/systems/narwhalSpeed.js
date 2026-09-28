import { CONFIG } from '../core/config.js';

export class NarwhalSpeed {
    constructor() {}
    
    // Apply speed modifier to creature's current speed
    applySpeedModifier(creature, currentSpeed = CONFIG.BASE_SPEED) {
        let speed = currentSpeed;
        
        if (creature) {
            if (creature.type === 'shark') {
                speed *= (CONFIG.SHARK_SPEED_MULTIPLIER || 1.33);
            } else if (creature.type === 'dolphin') {
                speed *= (CONFIG.DOLPHIN_SPEED_MULTIPLIER || 1.12);
            } else if (creature.type === 'knifefish') {
                speed *= (CONFIG.KNIFEFISH_SPEED_MULTIPLIER || 1.2);
            }

            if (creature.speedModifier && creature.speedModifier > 1.0) {
                speed *= creature.speedModifier;
            }
            // Apply ink slow effect (50% speed penalty)
            if (creature.isInked) {
                speed *= 0.5;
            }
            // Apply tentacle slow effect (35% speed penalty)
            if (creature._tentacleSlowed) {
                speed *= 0.65;
            }
        }
        return speed;
    }
    
    // Initialize a new creature with default speed settings
    initializeNarwhal(creature) {
        creature.speedModifier = 1.0;
        creature.staminaCooldownModifier = 1.0;
    }
    
    // Update speed and cooldown settings (upgrades removed)
    updateSpeedSettings(creature) {
        creature.speedModifier = 1.0;
        creature.staminaCooldownModifier = 1.0;
        return creature;
    }
}
