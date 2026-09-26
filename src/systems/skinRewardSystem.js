import { CONFIG } from '../core/config.js';

export class SkinRewardSystem {
    constructor(game) {
        this.game = game;
    }
    
    checkForSkinRewards(creature, upgradeKey) {
        if (!creature || !this.game.skinSystem) return;
        
        // Check for specific upgrade-based rewards
        if (upgradeKey === 'tuskLength1') {
            if (creature.type === 'shark') {
                // Bite strength upgrade for shark unlocks hammerhead skin
                this.game.skinSystem.unlockSkin('shark', 'hammerhead');
                this.createSkinUnlockNotification('Hammerhead Shark');
            } else if (creature.type === 'squid') {
                // Damage upgrade for squid unlocks octopus skin
                this.game.skinSystem.unlockSkin('squid', 'octopus');
                this.createSkinUnlockNotification('Octopus');
            }
        }
    }
    
    createSkinUnlockNotification(skinName) {
        if (this.game.upgradeSystem) {
            this.game.upgradeSystem.createNotification(`Unlocked skin: ${skinName}!`, this.game.creature);
        }
    }
}