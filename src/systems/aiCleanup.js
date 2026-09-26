export class AICleanup {
    constructor(game) {
        this.game = game;
        this.lastCleanupTime = 0;
        this.cleanupInterval = 5000; // Check for stale AI players every 5 seconds
    }
    
    checkForStaleAI() {
        const now = performance.now();
        
        // Only run cleanup periodically
        if (now - this.lastCleanupTime < this.cleanupInterval) {
            return;
        }
        
        this.lastCleanupTime = now;
        
        // Find AI players in presences that aren't in aiPlayers
        const staleAIIds = Object.keys(this.game.playerPresences || {}).filter(clientId => {
            return clientId.startsWith('ai-') && !this.game.aiController.aiPlayers[clientId];
        });
        
        // Remove stale AI players from playerPresences and all other references
        staleAIIds.forEach(aiId => {
            delete this.game.playerPresences[aiId];
            delete this.game.aiController.aiPresences[aiId];
            delete this.game.players[aiId]; // Also remove from players collection
            
            // Clean up any tentacle-related references
            if (this.game.squidAbilities && this.game.squidAbilities.tentacleHitboxes) {
                delete this.game.squidAbilities.tentacleHitboxes[aiId];
            }
            
            // Clean up any ink effect references
            if (this.game.inkSystem && this.game.inkSystem.affectedPlayers) {
                delete this.game.inkSystem.affectedPlayers[aiId];
            }
            
            console.log(`Cleaned up stale AI: ${aiId}`);
        });
    }
}