import { CONFIG } from '../core/config.js';

export class SkinUnlockSystem {
    constructor(game) {
        this.game = game;
        this.currentSessionKills = {
            narwhal: 0,
            shark: 0, 
            squid: 0
        };
        this.lastKillTime = 0;
    }
    
    // Track kills during a specific game session
    trackKill(creatureType) {
        const now = performance.now();
        this.lastKillTime = now;
        if (creatureType) {
            this.currentSessionKills[creatureType]++;
        }
    }
    
    // Check for unlocks - not needed as all creatures and skins are unlocked for all players
    checkUnlocks(creatureType) {
        // All creatures & skins are freely unlocked
    }
    
    // Reset session kills for a specific creature type when it dies
    resetSessionKills(creatureType) {
        if (creatureType) {
            this.currentSessionKills[creatureType] = 0;
        }
    }
    
    // Reset all session kills (on game start)
    resetAllSessionKills() {
        this.currentSessionKills = {
            narwhal: 0,
            shark: 0,
            squid: 0
        };
        this.lastKillTime = 0;
    }
    
    // Unlock a specific skin
    unlockSkin(creatureType, skinId) {
        if (this.game.skinSystem) {
            this.game.skinSystem.unlockSkin(creatureType, skinId);
        }
    }
}