import { CONFIG } from '../core/config.js';

export class OctopusTentacleEffect {
    constructor(game) {
        this.game = game;
        this.caughtPlayers = {};
    }
    
    applySlow(targetCreature, octopusId) {
        if (!targetCreature || !targetCreature.isAlive) return;
        
        const targetId = targetCreature.id;
        
        // If not already slowed by tentacles
        if (!targetCreature._tentacleSlowed) {
            // Store original speed before applying slow
            targetCreature._originalTentacleSpeed = targetCreature.speed;
            targetCreature.speed = targetCreature._originalTentacleSpeed * 0.65;
            targetCreature._tentacleSlowed = true;
            
            // Track this player as caught
            this.caughtPlayers[targetId] = {
                octopusId: octopusId,
                lastContact: performance.now(),
                escapeTime: 0
            };
        } else {
            // Update last contact time
            if (this.caughtPlayers[targetId]) {
                this.caughtPlayers[targetId].lastContact = performance.now();
                this.caughtPlayers[targetId].escapeTime = 0; // Reset escape timer
            }
        }
    }
    
    checkEscaped() {
        const now = performance.now();
        
        for (const targetId in this.caughtPlayers) {
            const info = this.caughtPlayers[targetId];
            
            // If last contact was more than 100ms ago and no escape time set yet
            if (now - info.lastContact > 100 && info.escapeTime === 0) {
                // Mark when escape began
                info.escapeTime = now;
            }
            
            // If escaped for more than 1 second
            if (info.escapeTime > 0 && now - info.escapeTime > 1000) {
                // Restore speed
                this.removeEffect(targetId);
                
                // Remove from tracking
                delete this.caughtPlayers[targetId];
            }
        }
    }
    
    removeEffect(targetId) {
        // Handle local player
        if (targetId === this.game.room.clientId && this.game.creature) {
            if (this.game.creature._tentacleSlowed) {
                this.game.creature.speed = this.game.creature._originalTentacleSpeed;
                delete this.game.creature._tentacleSlowed;
                delete this.game.creature._originalTentacleSpeed;
            }
        }
        // Handle AI players
        else if (targetId.startsWith('ai-') && 
                 this.game.aiController.aiPlayers[targetId] && 
                 this.game.aiController.aiPlayers[targetId].creature) {
            
            const aiCreature = this.game.aiController.aiPlayers[targetId].creature;
            if (aiCreature._tentacleSlowed) {
                aiCreature.speed = aiCreature._originalTentacleSpeed;
                delete aiCreature._tentacleSlowed;
                delete aiCreature._originalTentacleSpeed;
            }
        }
        // Handle other human players via request
        else if (!targetId.startsWith('ai-')) {
            this.game.room.requestPresenceUpdate(targetId, {
                type: 'restoreSpeed'
            });
        }
    }
}