import { CONFIG } from '../core/config.js';

export class AIUpgradeSystem {
    constructor(game) {
        this.game = game;
    }
    
    // Process upgrade transfers when an AI kills another narwhal
    transferUpgradesFromKill(killerNarwhal, killedUpgrades) {
        return false;
    }
    
    // Apply a specific upgrade to an AI narwhal
    applyUpgrade(narwhal, upgradeKey) {
        // Upgrades removed per user request
    }
    
    // Check and apply upgrades based on kill count
    checkAIUpgrades(narwhal) {
        return false;
    }
}