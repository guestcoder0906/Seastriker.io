import { CreatureFactory } from '../entities/creatureFactory.js';
import { CONFIG } from './config.js';
import { Narwhal } from '../entities/narwhal.js';
import { Dolphin } from '../entities/dolphin.js';
import { Shark } from '../entities/shark.js';
import { Squid } from '../entities/squid.js';
import { KnifeFish } from '../entities/knifefish.js';
import { ColorUtils } from '../utils/colorUtils.js';
import { KnifeFishAbilities } from '../systems/knifeFishAbilities.js';

export class GameInitializer {
    constructor(game) {
        this.game = game;
        this.knifeFishAbilities = new KnifeFishAbilities(game);
    }

    createCreature(creatureType, x, y, username) {
        let creature;
        let requestedSkinId = null;
        
        if (creatureType === 'kabob' || creatureType === 'dolphin') {
            creatureType = 'dolphin';
        } else if (creatureType === 'hammerhead') {
            creatureType = 'shark';
            requestedSkinId = 'hammerhead';
        } else if (creatureType === 'octopus') {
            creatureType = 'squid';
            requestedSkinId = 'octopus';
        } else if (creatureType === 'random') {
            // Pick a random creature or skin
            const choices = [
                { type: 'narwhal', skin: 'default' },
                { type: 'dolphin', skin: 'default' },
                { type: 'shark', skin: 'default' },
                { type: 'shark', skin: 'hammerhead' },
                { type: 'squid', skin: 'default' },
                { type: 'squid', skin: 'octopus' },
                { type: 'knifefish', skin: 'default' }
            ];
            const chosen = choices[Math.floor(Math.random() * choices.length)];
            creatureType = chosen.type;
            requestedSkinId = chosen.skin;
        }

        if (requestedSkinId && this.game.skinSystem) {
            this.game.skinSystem.selectSkin(creatureType, requestedSkinId);
        }

        // Create the specific creature type
        switch (creatureType) {
            case 'narwhal':
                const narwhalColor = ColorUtils.getNarwhalColor();
                creature = new Narwhal(this.game.room.clientId, x, y, narwhalColor, username);
                break;
            case 'dolphin':
                const dolphinColor = ColorUtils.getDolphinColor ? ColorUtils.getDolphinColor() : '#2b90d9';
                creature = new Dolphin(this.game.room.clientId, x, y, dolphinColor, username);
                break;
            case 'shark':
                let sharkColor;
                // If hammerhead skin is selected, use grey colors only
                if (this.game.skinSystem && 
                    this.game.skinSystem.getSelectedSkin('shark')?.id === 'hammerhead') {
                    sharkColor = ColorUtils.getHammerheadSharkColor();
                } else {
                    sharkColor = ColorUtils.getSharkColor();
                }
                creature = new Shark(this.game.room.clientId, x, y, sharkColor, username);
                break;
            case 'squid':
                const squidColor = ColorUtils.getSquidColor();
                creature = new Squid(this.game.room.clientId, x, y, squidColor, username);
                break;
            case 'knifefish':
                const knifeFishColor = ColorUtils.getKnifeFishColor();
                creature = new KnifeFish(this.game.room.clientId, x, y, knifeFishColor, username);
                break;
            default:
                // Fallback to narwhal
                const fallbackColor = ColorUtils.getNarwhalColor();
                creature = new Narwhal(this.game.room.clientId, x, y, fallbackColor, username);
                creatureType = 'narwhal';
        }
        
        // Apply selected skin if available
        if (this.game.skinSystem) {
            const selectedSkin = this.game.skinSystem.getSelectedSkin(creatureType);
            if (selectedSkin) {
                creature.skinId = selectedSkin.id;
                creature.skinName = selectedSkin.name;
                
                // Apply special properties for hammerhead shark
                if (creatureType === 'shark' && selectedSkin.id === 'hammerhead') {
                    // Apply improved visibility for AI or other game mechanics
                    if (creature.sightRange) {
                        creature.sightRange *= CONFIG.HAMMERHEAD_VISION_MULTIPLIER;
                    }
                    // Apply wider attack range
                    creature.attackRangeMultiplier = CONFIG.HAMMERHEAD_ATTACK_RANGE_MULTIPLIER;
                }
                
                // Special properties for octopus
                if (creatureType === 'squid' && selectedSkin.id === 'octopus') {
                    creature.skinId = 'octopus';
                    creature.initializeSegments();
                    
                    // Initialize camouflage ability
                    creature.camouflageReady = true;
                    creature.camouflageTimer = 0;
                    creature.camouflageActiveTimer = 0;
                    creature.isCamouflaged = false;
                    creature.camouflageModifier = 1.0;
                    
                    // Remove ink ability for octopus
                    creature.inkReady = false;
                }
            }
        }
        
        // Apply special KnifeFish properties
        if (creatureType === 'knifefish') {
            this.knifeFishAbilities.applyKnifeFishProperties(creature);
        }
        
        return creature;
    }
    
    generateSpawnPoint() {
        // Generate random position away from borders
        const margin = 300;
        const x = margin + Math.random() * (CONFIG.WORLD_WIDTH - 2 * margin);
        const y = margin + Math.random() * (CONFIG.WORLD_HEIGHT - 2 * margin);
        
        return { x, y };
    }
}