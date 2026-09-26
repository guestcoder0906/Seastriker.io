import { CONFIG } from '../core/config.js';

export class CreatureSelectionManager {
    constructor(game) {
        this.game = game;
        this.selectedCreatureType = 'random'; // Default to random selection
        this.lastSelectedType = null;
    }
    
    setSelectedCreature(creatureType) {
        // Validate the selection
        if (!this.isValidCreatureType(creatureType)) {
            console.warn(`Invalid creature type: ${creatureType}`);
            return false;
        }
        
        // Store last selected type to prevent duplicate selection
        this.lastSelectedType = this.selectedCreatureType;
        this.selectedCreatureType = creatureType;
        return true;
    }
    
    isValidCreatureType(type) {
        return ['random', 'narwhal', 'dolphin', 'kabob', 'shark', 'hammerhead', 'squid', 'octopus', 'knifefish'].includes(type);
    }
    
    getSelectedCreature() {
        return this.selectedCreatureType;
    }
    
    resetSelection() {
        this.selectedCreatureType = 'random';
        this.lastSelectedType = null;
    }
}