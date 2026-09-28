import { CONFIG } from '../core/config.js';

export class OctopusAbilities {
    constructor(game) {
        this.game = game;
    }
    
    updateCamouflageStatus(squid, deltaTime) {
        if (!squid) return squid;

        // Standardize deltaTime to milliseconds (deltaTime could be in seconds like 0.0166s or frames like 1.0)
        let dtMs = 1000 / 60; // default 16.67ms
        if (typeof deltaTime === 'number' && deltaTime > 0) {
            if (deltaTime < 0.5) {
                // deltaTime is in seconds (e.g. 0.01667)
                dtMs = deltaTime * 1000;
            } else if (deltaTime <= 10) {
                // deltaTime is in frame count (e.g. 1.0 or 2.0 steps)
                dtMs = deltaTime * (1000 / 60);
            } else {
                // deltaTime is already in milliseconds
                dtMs = deltaTime;
            }
        }

        const maxDuration = CONFIG.OCTOPUS_CAMOUFLAGE_DURATION || 3000;
        const cooldownDuration = CONFIG.OCTOPUS_CAMOUFLAGE_COOLDOWN || 5000;

        // Safety fallback: check wall-clock timestamp to ensure camouflage NEVER stays on forever
        if (squid.isCamouflaged) {
            const now = Date.now();
            if (squid._camoStartTime && (now - squid._camoStartTime > maxDuration + 200)) {
                squid.isCamouflaged = false;
                squid.camouflageActiveTimer = 0;
                squid.camouflageReady = false;
                squid.camouflageTimer = cooldownDuration;
                delete squid._camoStartTime;
                return squid;
            }

            squid.camouflageActiveTimer = (squid.camouflageActiveTimer || maxDuration) - dtMs;
            
            // Check if camouflage duration has ended
            if (squid.camouflageActiveTimer <= 0) {
                squid.isCamouflaged = false;
                squid.camouflageActiveTimer = 0;
                squid.camouflageReady = false;
                squid.camouflageTimer = cooldownDuration;
                delete squid._camoStartTime;
            }
        } else if (!squid.camouflageReady && (squid.camouflageTimer > 0 || squid.camouflageTimer === undefined)) {
            // Update camouflage cooldown
            const modifier = squid.camouflageModifier || 1.0;
            if (squid.camouflageTimer === undefined) {
                squid.camouflageTimer = cooldownDuration;
            }
            squid.camouflageTimer -= dtMs * modifier;
            
            if (squid.camouflageTimer <= 0) {
                squid.camouflageReady = true;
                squid.camouflageTimer = 0;
            }
        }
        
        return squid;
    }
    
    activateCamouflage(squid) {
        if (!squid || !squid.camouflageReady || squid.isCamouflaged) return false;
        
        squid.isCamouflaged = true;
        squid.camouflageReady = false;
        squid.camouflageActiveTimer = CONFIG.OCTOPUS_CAMOUFLAGE_DURATION || 3000;
        squid.camouflageTimer = 0;
        squid._camoStartTime = Date.now();
        
        return true;
    }
    
    // Default camouflage modifier (no upgrades)
    applyCamouflageUpgrades(squid) {
        if (!squid) return squid;
        squid.camouflageModifier = 1.0;
        return squid;
    }

    // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
    shouldEvadeAttack(creatureOrPresence) {
        if (!creatureOrPresence) return false;
        
        const isOctopus = creatureOrPresence.skinId === 'octopus' || 
                          (creatureOrPresence.type === 'squid' && creatureOrPresence.skinId === 'octopus');
        const isCamouflaged = Boolean(creatureOrPresence.isCamouflaged);
        
        if (isOctopus && isCamouflaged) {
            // 50% chance for incoming attack / damage to not happen (evaded)
            return Math.random() < 0.5;
        }
        return false;
    }
}
