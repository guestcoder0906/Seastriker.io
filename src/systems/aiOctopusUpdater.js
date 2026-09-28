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
            
            // Check if AI octopus should activate camouflage
            if (!ai.creature.isCamouflaged && ai.creature.camouflageReady && this.shouldUseCamouflage(ai, aiId)) {
                this.game.octopusAbilities.activateCamouflage(ai.creature);
            }
        }
        
        const isCamo = Boolean(ai.creature.isCamouflaged);
        const camoTimer = ai.creature.camouflageTimer || 0;
        const camoActiveTimer = ai.creature.camouflageActiveTimer || 0;
        const camoReady = Boolean(ai.creature.camouflageReady);
        
        // Check if aiPresences exists before accessing it
        if (!this.game.aiController.aiPresences) {
            this.game.aiController.aiPresences = {};
        }
        
        if (!this.game.aiController.aiPresences[aiId]) {
            this.game.aiController.aiPresences[aiId] = ai.creature.getPresenceData();
        }
        
        // Keep camouflage state strictly synchronized
        this.game.aiController.aiPresences[aiId].isCamouflaged = isCamo;
        this.game.aiController.aiPresences[aiId].camouflageReady = camoReady;
        this.game.aiController.aiPresences[aiId].camouflageActiveTimer = camoActiveTimer;
        this.game.aiController.aiPresences[aiId].camouflageTimer = camoTimer;
        
        // Update game presence
        if (!this.game.playerPresences) {
            this.game.playerPresences = {};
        }
        if (this.game.playerPresences[aiId]) {
            this.game.playerPresences[aiId].isCamouflaged = isCamo;
            this.game.playerPresences[aiId].camouflageActiveTimer = camoActiveTimer;
        }
        
        if (this.game.interpolatedPresences && this.game.interpolatedPresences[aiId]) {
            this.game.interpolatedPresences[aiId].isCamouflaged = isCamo;
            this.game.interpolatedPresences[aiId].camouflageActiveTimer = camoActiveTimer;
        }
    }
    
    // Helper to determine if AI should use camouflage
    shouldUseCamouflage(ai, aiId) {
        if (!ai.creature || !ai.creature.camouflageReady || ai.creature.isCamouflaged) return false;
        
        // Check if there are nearby players that might be threats or targets
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue;
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;
            
            // Calculate distance to other player
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If close and potentially threatening, use camouflage
            if (distance < CONFIG.AI_SIGHT_RANGE * 0.5) {
                return true;
            }
        }
        
        return false;
    }
}
