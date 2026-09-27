export class NarwhalSpeed {
    constructor() {}
    
    // Apply speed modifier to creature's current speed
    applySpeedModifier(creature, currentSpeed) {
        let speed = currentSpeed;
        if (creature.speedModifier && creature.speedModifier > 1.0) {
            speed = currentSpeed * creature.speedModifier;
        }
        // Apply ink slow effect (50% speed penalty)
        if (creature.isInked) {
            speed *= 0.5;
        }
        // Apply tentacle slow effect (35% speed penalty)
        if (creature._tentacleSlowed) {
            speed *= 0.65;
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
