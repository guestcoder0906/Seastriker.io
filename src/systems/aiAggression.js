import { CONFIG } from '../core/config.js';

export class AIAggression {
    constructor(game) {
        this.game = game;
    }

    // Determine if an AI narwhal should be aggressive
    shouldBeAggressive(ai, aiId) {
        // Higher chance to be aggressive (80% chance)
        return Math.random() < 0.8;
    }
    
    // Find the best target to attack
    findBestTarget(ai, aiId) {
        let bestTarget = null;
        let lowestHealth = Number.MAX_VALUE;
        let closestDistance = Number.MAX_VALUE;
        
        // Search for vulnerable targets (with low health) or close targets
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue; // Skip self
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive) continue;
            
            // Skip if presence doesn't have segments
            if (!presence.segments || !presence.segments[0]) continue;
            
            // Skip creatures hiding inside coral reefs since they are protected
            if (presence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(presence))) {
                continue;
            }
            
            // Calculate distance
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Skip if out of sight range
            if (distance > ai.sightRange) continue;
            
            // Prioritize players with lower health or closer distance
            const targetMaxHealth = presence.maxHealth || (presence.type === 'dolphin' ? (CONFIG.DOLPHIN_MAX_HEALTH || 120) : CONFIG.MAX_HEALTH);
            const health = typeof presence.health === 'number' ? presence.health : targetMaxHealth;
            
            // Weighted scoring: prioritize low health and close distance
            const score = (health / targetMaxHealth) * 0.4 + (distance / ai.sightRange) * 0.6;
            
            if (bestTarget === null || score < closestDistance) {
                bestTarget = clientId;
                closestDistance = score;
                lowestHealth = health;
            }
        }
        
        return bestTarget;
    }
    
    // Position AI for attack - lead target and position for tusk strike
    positionForAttack(ai, targetPresence) {
        if (!targetPresence || !targetPresence.segments || !targetPresence.segments[0]) return null;
        
        // Calculate attack vector
        const targetX = targetPresence.segments[0].x;
        const targetY = targetPresence.segments[0].y;
        
        // Get target velocity for leading the target
        const targetVelocity = targetPresence.velocity || { x: 0, y: 0 };
        
        // Lead factor based on distance
        const dx = targetX - ai.creature.segments[0].x;
        const dy = targetY - ai.creature.segments[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // More leading at medium distances, less at close range
        let leadFactor = 0;
        if (distance > 100 && distance < 400) {
            leadFactor = 30;
        } else if (distance >= 400) {
            leadFactor = 40;
        } else {
            leadFactor = 10; // Minimal leading at close range
        }
        
        // Calculate position to aim for (leading the target)
        const aimX = targetX + targetVelocity.x * leadFactor;
        const aimY = targetY + targetVelocity.y * leadFactor;
        
        return { x: aimX, y: aimY, distance: distance };
    }
    
    // Determine if now is a good time to dash
    shouldDash(ai, targetInfo) {
        if (!targetInfo) return false;
        
        // Dash when at medium range and stamina is ready
        const distance = targetInfo.distance;
        
        if (distance > 150 && distance < 450 && ai.creature.staminaReady) {
            // Higher chance to dash when in good position, even more aggressive now
            return Math.random() < 0.85; // Increased dash chance to 85%
        }
        
        return false;
    }
    
    // Determine if now is a good time to dodge
    shouldDodge(ai, aiId) {
        // Check nearby narwhals for threats
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue;
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive) continue;
            if (!presence.segments || !presence.segments[0]) continue;
            
            // Calculate distance
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Check if close and potential threat
            if (distance < 180) {
                // Check relative angle - are they facing us?
                const angleBetween = Math.atan2(dy, dx);
                const theirAngle = presence.segments[0].angle;
                
                // Calculate angle difference
                let angleDiff = Math.abs(theirAngle - angleBetween);
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                angleDiff = Math.abs(angleDiff);
                
                // If they're pointing at us or dashing toward us, dodge!
                if ((angleDiff < 0.6 || presence.isDashing) && distance < 150) {
                    return true;
                }
            }
        }
        
        return false;
    }
}