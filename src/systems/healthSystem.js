import { CONFIG } from '../core/config.js';
import { CreatureFactory } from '../entities/creatureFactory.js';

export class HealthSystem {
    constructor(game) {
        this.game = game;
    }
    
    // Process health regeneration for the local narwhal
    updateHealth() {
        let narwhal = this.game.creature;
        if (!narwhal || !narwhal.isAlive || !this.game.gameActive) return; // Check gameActive state
        
        if (narwhal.health < CONFIG.MAX_HEALTH) {
            narwhal.health = Math.min(CONFIG.MAX_HEALTH, narwhal.health + CONFIG.HEALTH_REGEN_RATE);
            
            // Update the presence with new health value
            this.game.room.updatePresence({
                health: narwhal.health
            });
        }
    }
    
    // Process damage received from another player
    processDamage(damageType, damageAmount, attackerClientId, alreadyEvadeChecked = false) {
        let narwhal = this.game.creature;
        
        if (!narwhal || !narwhal.isAlive || !this.game.gameActive) return false; // Check gameActive state
        
        // Cannot take damage if hiding inside coral
        if (narwhal.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(narwhal))) {
            return false;
        }

        // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
        if (!alreadyEvadeChecked && this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(narwhal)) {
            return false;
        }
        
        // Apply damage
        narwhal.health -= damageAmount;
        
        // Check if narwhal is dead
        if (narwhal.health <= 0) {
            narwhal.health = 0;
            narwhal.die();
            
            // Clear any tentacle slow effect
            if (narwhal._tentacleSlowed) {
                delete narwhal._tentacleSlowed;
                delete narwhal._originalTentacleSpeed;
            }
            
            // Update presence to show we're dead
            this.game.room.updatePresence({
                ...narwhal.getPresenceData(),
                health: 0,
                isAlive: false
            });
            
            // Let the game handle showing the death screen
            return true; // Indicate that the player died
        } else {
            // Just update the health
            this.game.room.updatePresence({
                health: narwhal.health
            });
            
            return false; // Player didn't die
        }
    }
    
    // Draw health bar for a creature
    drawHealthBar(ctx, narwhal) {
        if (!narwhal || !narwhal.segments || narwhal.segments.length === 0) return;
        const headSegment = narwhal.segments[0];
        const x = headSegment.x;
        const y = headSegment.y - CONFIG.SEGMENT_SIZE * 2.5;
        const width = 40;
        const height = 5;
        
        // Background (empty health)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - width/2, y, width, height);
        
        // Health amount - safely clamp between 0 and 1
        const healthVal = narwhal.health !== undefined ? narwhal.health : CONFIG.MAX_HEALTH;
        const healthPercentage = Math.max(0, Math.min(1, healthVal / CONFIG.MAX_HEALTH));
        let healthColor;
        
        if (healthPercentage > 0.6) {
            healthColor = 'lime';
        } else if (healthPercentage > 0.3) {
            healthColor = 'yellow';
        } else {
            healthColor = 'red';
        }
        
        ctx.fillStyle = healthColor;
        ctx.fillRect(x - width/2, y, width * healthPercentage, height);
        
        // Border
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - width/2, y, width, height);
    }
}