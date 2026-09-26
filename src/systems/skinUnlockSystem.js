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
    
    // Track kills during a specific game session for the currently selected creature
    trackKill(creatureType) {
        const now = performance.now();
        this.lastKillTime = now;
        
        // Only increment the counter for the current creature type
        if (creatureType) {
            this.currentSessionKills[creatureType]++;
            
            // Check unlocks based on session-specific kill counts
            this.checkUnlocks(creatureType);
        }
    }
    
    // Check for unlocks based on session kill counts
    checkUnlocks(creatureType) {
        switch(creatureType) {
            case 'shark':
                // 10 kills with shark in a single session
                if (this.currentSessionKills.shark >= 10) {
                    this.unlockSkin('shark', 'hammerhead');
                }
                break;
            case 'squid':
                // 5 kills with squid in a single session
                if (this.currentSessionKills.squid >= 5) {
                    this.unlockSkin('squid', 'octopus');
                }
                break;
        }
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