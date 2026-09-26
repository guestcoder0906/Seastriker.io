import { CONFIG } from '../core/config.js';

export class NarwhalCollisionHelper {
    // Helper functions for narwhal collision calculations
    
    static calculateDamage(narwhal, damageAmount) {
        // Apply damage multiplier if it exists
        if (narwhal.damageMultiplier) {
            return damageAmount * narwhal.damageMultiplier;
        }
        return damageAmount;
    }
    
    static getTuskDamage(narwhal, hitType) {
        let baseDamage = 0;
        
        switch(hitType) {
            case 'headHit':
                baseDamage = CONFIG.HEAD_HIT_DAMAGE / 2;
                break;
            case 'bodyHit':
                baseDamage = CONFIG.BODY_HIT_DAMAGE;
                break;
            case 'tailHit':
                baseDamage = CONFIG.TAIL_HIT_DAMAGE;
                break;
            case 'lethal':
                baseDamage = CONFIG.HEAD_HIT_DAMAGE;
                break;
        }
        
        return this.calculateDamage(narwhal, baseDamage);
    }
}

