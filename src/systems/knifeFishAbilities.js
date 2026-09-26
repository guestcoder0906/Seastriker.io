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
        
        // KnifeFish can always see camouflaged creatures
        knifefish.canSeeCamouflaged = true;
        
        return knifefish;
    }
}