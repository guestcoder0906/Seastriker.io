import { CONFIG } from '../core/config.js';
import { Narwhal } from './narwhal.js';
import { Shark } from './shark.js'; 
import { ColorUtils } from '../utils/colorUtils.js'; 
import { Squid } from './squid.js'; 
import { KnifeFish } from './knifefish.js'; 
import { Dolphin } from './dolphin.js';

export class CreatureFactory {
    static createCreature(id, x, y, color, name, realPlayerCount = 0) {
        const creatureType = Math.random();
        
        let knifeFishThreshold = 0.25;
        let squidThreshold = 0.50;
        let sharkThreshold = 0.75;
        
        // For AI players, scale smaller NPCs (knife fish, squid/octopus) down if more real players are online
        if (id.startsWith('ai-')) {
            const smallCreatureChance = Math.max(0.05, 0.40 - (realPlayerCount * 0.12));
            knifeFishThreshold = smallCreatureChance / 2;
            squidThreshold = smallCreatureChance;
            sharkThreshold = smallCreatureChance + (1.0 - smallCreatureChance) / 2;
        }
        
        if (creatureType < knifeFishThreshold) { // Knife Fish
            color = ColorUtils.getKnifeFishColor();
            return new KnifeFish(id, x, y, color, name);
        } else if (creatureType < squidThreshold) { // Squid
            color = ColorUtils.getSquidColor();
            const squid = new Squid(id, x, y, color, name);
            
            // For AI players, give a chance to be an octopus
            if (id.startsWith('ai-') && Math.random() < CONFIG.OCTOPUS_AI_CHANCE) {
                squid.skinId = 'octopus';
                squid.skinName = 'Octopus';
                squid.initializeSegments();
                
                // Initialize camouflage ability
                squid.camouflageReady = true;
                squid.camouflageTimer = 0;
                squid.camouflageActiveTimer = 0;
                squid.isCamouflaged = false;
                squid.camouflageModifier = 1.0;
                
                // Remove ink ability for octopus
                squid.inkReady = false;
            }
            
            return squid;
        } else if (creatureType < sharkThreshold) { // Shark
            color = ColorUtils.getSharkColor();
            const shark = new Shark(id, x, y, color, name);
            
            // For AI players, give a chance to be a hammerhead shark
            if (id.startsWith('ai-') && Math.random() < CONFIG.HAMMERHEAD_SHARK_AI_CHANCE) {
                shark.skinId = 'hammerhead';
                shark.skinName = 'Hammerhead Shark';
                // Use specific hammerhead grey color instead of passed color
                shark.color = ColorUtils.getHammerheadSharkColor();
                // Apply special hammerhead properties
                shark.sightRange = CONFIG.AI_SIGHT_RANGE * CONFIG.HAMMERHEAD_VISION_MULTIPLIER;
                // Apply wider attack range
                shark.attackRangeMultiplier = CONFIG.HAMMERHEAD_ATTACK_RANGE_MULTIPLIER;
            }
            
            return shark;
        } else { // Narwhal or Dolphin
            if (Math.random() < (CONFIG.DOLPHIN_AI_CHANCE || 0.4)) {
                color = ColorUtils.getDolphinColor ? ColorUtils.getDolphinColor() : '#2b90d9';
                return new Dolphin(id, x, y, color, name);
            } else {
                color = ColorUtils.getNarwhalColor();
                return new Narwhal(id, x, y, color, name);
            }
        }
    }
}