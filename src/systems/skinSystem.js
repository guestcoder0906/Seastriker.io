import { CONFIG } from '../core/config.js';

export class SkinSystem {
    constructor(game) {
        this.game = game;
        this.skins = {
            narwhal: [
                {
                    id: 'default',
                    name: 'Default Narwhal',
                    description: 'The standard narwhal.',
                    unlocked: true,
                    selected: true
                }
            ],
            shark: [
                {
                    id: 'default',
                    name: 'Default Shark',
                    description: 'The standard shark.',
                    unlocked: true,
                    selected: true
                },
                {
                    id: 'hammerhead',
                    name: 'Hammerhead Shark',
                    description: 'Wider field of vision and attack range thanks to its distinctive hammerhead shape.',
                    unlockRequirement: '',
                    unlocked: true,
                    selected: false,
                    visionMultiplier: CONFIG.HAMMERHEAD_VISION_MULTIPLIER,
                    attackRangeMultiplier: CONFIG.HAMMERHEAD_ATTACK_RANGE_MULTIPLIER
                }
            ],
            squid: [
                {
                    id: 'default',
                    name: 'Default Squid',
                    description: 'The standard squid.',
                    unlocked: true,
                    selected: true
                },
                {
                    id: 'octopus',
                    name: 'Octopus',
                    description: 'Can camouflage for 3 seconds, oval-shaped head, longer tentacles, and slightly bigger than a squid.',
                    unlockRequirement: '',
                    unlocked: true,
                    selected: false
                }
            ],
            knifefish: [
                {
                    id: 'default',
                    name: 'Default Knife Fish',
                    description: 'The standard knife fish.',
                    unlocked: true,
                    selected: true
                }
            ],
            dolphin: [
                {
                    id: 'default',
                    name: 'Default Dolphin',
                    description: 'The standard dolphin.',
                    unlocked: true,
                    selected: true
                }
            ]
        };
        
        this.loadSkinData();
    }
    
    loadSkinData() {
        try {
            const savedSkins = localStorage.getItem('seaStrikerSkins');
            if (savedSkins) {
                const parsedSkins = JSON.parse(savedSkins);
                
                // Apply saved selected status by matching skin ids (all skins are free & unlocked)
                for (const creatureType in this.skins) {
                    if (parsedSkins[creatureType]) {
                        this.skins[creatureType].forEach((skin) => {
                            skin.unlocked = true;
                            const savedSkin = parsedSkins[creatureType].find(s => s.id === skin.id);
                            if (savedSkin) {
                                skin.selected = savedSkin.selected;
                            }
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Error loading skin data:', e);
        }
    }
    
    saveSkinData() {
        try {
            localStorage.setItem('seaStrikerSkins', JSON.stringify(this.skins));
        } catch (e) {
            console.error('Error saving skin data:', e);
        }
    }
    
    getSelectedSkin(creatureType) {
        if (!this.skins[creatureType]) return null;
        
        return this.skins[creatureType].find(skin => skin.selected) || this.skins[creatureType][0];
    }
    
    selectSkin(creatureType, skinId) {
        if (!this.skins[creatureType]) return false;
        
        // Find the skin
        const skin = this.skins[creatureType].find(s => s.id === skinId);
        if (!skin) return false;
        skin.unlocked = true;
        
        // Deselect all skins for this creature type
        this.skins[creatureType].forEach(s => s.selected = false);
        
        // Select the requested skin
        skin.selected = true;
        this.saveSkinData();
        
        return true;
    }
    
    unlockSkin(creatureType, skinId) {
        if (!this.skins[creatureType]) return false;
        const skin = this.skins[creatureType].find(s => s.id === skinId);
        if (!skin) return false;
        skin.unlocked = true;
        this.saveSkinData();
        return true;
    }
}