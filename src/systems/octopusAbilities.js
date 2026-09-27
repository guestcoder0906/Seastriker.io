import { CONFIG } from '../core/config.js';

export class OctopusAbilities {
    constructor(game) {
        this.game = game;
    }
    
    updateCamouflageStatus(squid, deltaTime) {
        // Update camouflage cooldown
        if (!squid.camouflageReady && squid.camouflageTimer > 0) {
            // Apply cooldown modifier if available
            if (squid.camouflageModifier) {
                squid.camouflageTimer -= deltaTime * squid.camouflageModifier;
            } else {
                squid.camouflageTimer -= deltaTime;
            }
            
            // Check if cooldown is complete - FIX: Set camouflageReady to true
            if (squid.camouflageTimer <= 0) {
                squid.camouflageReady = true;
                squid.camouflageTimer = 0;
            }
        }
        
        // Check if camouflage duration has ended
        if (squid.isCamouflaged && squid.camouflageActiveTimer <= 0) {
            squid.isCamouflaged = false;
            squid.camouflageReady = false;
            squid.camouflageTimer = CONFIG.OCTOPUS_CAMOUFLAGE_COOLDOWN;
        } else if (squid.isCamouflaged) {
            squid.camouflageActiveTimer -= deltaTime;
        }
        
        return squid;
    }
    
    activateCamouflage(squid) {
        if (!squid.camouflageReady || squid.isCamouflaged) return false;
        
        squid.isCamouflaged = true;
        squid.camouflageActiveTimer = CONFIG.OCTOPUS_CAMOUFLAGE_DURATION;
        
        return true;
    }
    
    // Default camouflage modifier (no upgrades)
    applyCamouflageUpgrades(squid) {
        squid.camouflageModifier = 1.0;
        return squid;
    }

    // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
    shouldEvadeAttack(creatureOrPresence) {
        if (!creatureOrPresence) return false;
        
        const isOctopus = creatureOrPresence.skinId === 'octopus' || 
                          (creatureOrPresence.type === 'squid' && creatureOrPresence.skinId === 'octopus');
        const isCamouflaged = !!creatureOrPresence.isCamouflaged;
        
        if (isOctopus && isCamouflaged) {
            // 50% chance for incoming attack / damage to not happen (evaded)
            return Math.random() < 0.5;
        }
        return false;
    }
}