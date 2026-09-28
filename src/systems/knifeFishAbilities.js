import { CONFIG } from '../core/config.js';

export class KnifeFishAbilities {
    constructor(game) {
        this.game = game;
    }
    
    // Check if a creature can see camouflaged creatures
    canSeeCamouflaged(creature) {
        // KnifeFish can always see camouflaged creatures
        if (creature && creature.type === 'knifefish') {
            return true;
        }
        
        return false;
    }
    
    // Apply modifiers when creating a new KnifeFish
    applyKnifeFishProperties(knifefish) {
        if (!knifefish) return;
        
        // KnifeFish can always see camouflaged creatures and regenerates health slightly faster
        knifefish.canSeeCamouflaged = true;
        knifefish.healthRegenModifier = CONFIG.KNIFEFISH_HEALTH_REGEN_MULTIPLIER || 1.4;
        
        return knifefish;
    }
}