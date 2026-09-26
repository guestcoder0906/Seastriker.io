import { CONFIG } from '../core/config.js';

export class AIOctopusUpdater {
    constructor(game) {
        this.game = game;
    }
    
    updateAIOctopus(aiId, ai, deltaTime) {
        if (!ai || !ai.creature || ai.creature.type !== 'squid' || ai.creature.skinId !== 'octopus') {
            return;
        }
        
        // Update camouflage cooldown and status
        if (this.game.octopusAbilities) {
            this.game.octopusAbilities.updateCamouflageStatus(ai.creature, deltaTime);
            this.game.octopusAbilities.applyCamouflageUpgrades(ai.creature);
        }
        
        // Update AI presence with current camouflage status
        if (ai.creature.isCamouflaged || ai.creature.camouflageTimer > 0 || ai.creature.camouflageReady) {
            // Check if aiPresences exists before accessing it
            if (!this.game.aiController.aiPresences) {
                this.game.aiController.aiPresences = {};
            }
            
            // Initialize the AI presence if it doesn't exist
            if (!this.game.aiController.aiPresences[aiId]) {
                this.game.aiController.aiPresences[aiId] = {};
            }
            
            this.game.aiController.aiPresences[aiId].isCamouflaged = ai.creature.isCamouflaged;
            this.game.aiController.aiPresences[aiId].camouflageReady = ai.creature.camouflageReady;
            this.game.aiController.aiPresences[aiId].camouflageActiveTimer = ai.creature.camouflageActiveTimer;
            this.game.aiController.aiPresences[aiId].camouflageTimer = ai.creature.camouflageTimer;
            
            // Update game presence
            if (!this.game.playerPresences) {
                this.game.playerPresences = {};
            }
            this.game.playerPresences[aiId] = this.game.aiController.aiPresences[aiId];
        }
    }
    
    // Helper to determine if AI should use camouflage
    shouldUseCamouflage(ai, aiId) {
        if (!ai.creature.camouflageReady) return false;
        
        // Check if there are nearby players that might be threats
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue;
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;
            
            // Calculate distance to other player
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If close and potentially threatening, use camouflage
            if (distance < CONFIG.AI_SIGHT_RANGE * 0.6) {
                return true;
            }
        }
        
        return false;
    }
}