import { CONFIG } from '../core/config.js';

export class KnifeFishDodgeHandler {
    constructor(game) {
        this.game = game;
    }
    
    // Calculate dodge direction for knifefish based on closest creature
    calculateDodgeDirection(knifeFish) {
        // Find the closest creature
        let closestDistance = Number.MAX_VALUE;
        let closestCreature = null;
        
        for (const clientId in this.game.playerPresences) {
            // Skip self
            if (clientId === knifeFish.id) continue;
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments.length === 0) continue;
            
            // Calculate distance to this creature
            const dx = presence.segments[0].x - knifeFish.segments[0].x;
            const dy = presence.segments[0].y - knifeFish.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only consider creatures within a reasonable range (400 units)
            if (distance < 400 && distance < closestDistance) {
                closestDistance = distance;
                closestCreature = presence;
            }
        }
        
        // If no creatures nearby, dodge backward (default behavior)
        if (!closestCreature) {
            return {
                x: -Math.cos(knifeFish.rotationAngle),
                y: -Math.sin(knifeFish.rotationAngle)
            };
        }
        
        // Calculate direction vector from closest creature to knifefish
        const dirX = knifeFish.segments[0].x - closestCreature.segments[0].x;
        const dirY = knifeFish.segments[0].y - closestCreature.segments[0].y;
        
        // Normalize the direction vector
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
        
        return {
            x: dirX / magnitude,
            y: dirY / magnitude
        };
    }
}