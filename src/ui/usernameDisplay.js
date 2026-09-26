export class UsernameDisplay {
    constructor(game) {
        this.game = game;
    }
    
    getPlayerName(clientId) {
        // First check if this is a real player
        if (this.game.room.peers[clientId]) {
            return this.game.room.peers[clientId].username || "Unknown";
        }
        
        // Check if this is an AI player
        if (clientId.startsWith('ai-') && 
            this.game.playerPresences[clientId] && 
            this.game.playerPresences[clientId].name) {
            return this.game.playerPresences[clientId].name;
        }
        
        // Fallback
        return "Player";
    }
    
    drawUsername(ctx, creature, isLocalPlayer = false) {
        if (!creature || !creature.segments || creature.segments.length === 0) return;
        
        const headX = creature.segments[0].x;
        const headY = creature.segments[0].y;
        const nameY = headY - 40; // Position name above creature
        
        // Get proper username
        const name = creature.name || this.getPlayerName(creature.id);
        
        // Draw name with background for better readability
        ctx.save();
        ctx.font = 'bold 12px Arial';
        const textWidth = ctx.measureText(name).width;
        
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(headX - textWidth/2 - 4, nameY - 12, textWidth + 8, 16);
        
        // Draw text
        ctx.fillStyle = isLocalPlayer ? '#FFFF00' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(name, headX, nameY);
        ctx.restore();
    }
    
    updateCreatureNames() {
        // Update names for all creatures in the game
        for (const clientId in this.game.playerPresences) {
            if (this.game.playerPresences[clientId] && this.game.playerPresences[clientId].isAlive) {
                // Get proper name
                const name = this.getPlayerName(clientId);
                
                // Update presence name
                if (this.game.playerPresences[clientId].name !== name) {
                    this.game.playerPresences[clientId].name = name;
                    
                    // For local player, update creature name directly
                    if (clientId === this.game.room.clientId && this.game.creature) {
                        this.game.creature.name = name;
                    }
                    
                    // For AI players, update creature name
                    if (clientId.startsWith('ai-') && 
                        this.game.aiController.aiPlayers[clientId] && 
                        this.game.aiController.aiPlayers[clientId].creature) {
                        this.game.aiController.aiPlayers[clientId].creature.name = name;
                    }
                }
            }
        }
    }
}