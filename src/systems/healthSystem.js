import { CONFIG } from '../core/config.js';

export class HealthSystem {
    constructor(game) {
        this.game = game;
        this.lastDamageTime = 0;
    }
    
    // Process health regeneration for the local creature
    updateHealth() {
        const creature = this.game.creature;
        if (!creature || !creature.isAlive || !this.game.gameActive) return;
        
        // Only regenerate health after 3 seconds of taking no damage
        const now = performance.now();
        if (creature.health < CONFIG.MAX_HEALTH && (now - this.lastDamageTime > 3000)) {
            const regenAmount = CONFIG.HEALTH_REGEN_RATE || 0.1;
            creature.health = Math.min(CONFIG.MAX_HEALTH, creature.health + regenAmount);
            
            // Sync updated health
            if (this.game.room) {
                this.game.room.updatePresence({
                    health: creature.health
                });
            }
        }
    }
    
    // Process damage received from an AI, another player, or environment
    processDamage(damageType, damageAmount, attackerClientId, alreadyEvadeChecked = false) {
        const creature = this.game.creature;
        
        if (!creature || !creature.isAlive || !this.game.gameActive) return false;
        
        // Protected if hiding inside coral reef
        if (creature.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(creature))) {
            return false;
        }

        // While octopus is camouflaged, 50% chance to evade
        if (!alreadyEvadeChecked && this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(creature)) {
            return false;
        }
        
        // Ensure damage is a valid positive number
        const effectiveDamage = Math.max(1, typeof damageAmount === 'number' && !isNaN(damageAmount) ? damageAmount : 18);
        
        const now = performance.now();
        this.lastDamageTime = now;
        creature.lastDamaged = now;
        
        // Decrease health
        creature.health = Math.max(0, creature.health - effectiveDamage);
        
        // Check if dead
        if (creature.health <= 0) {
            creature.health = 0;
            creature.die();
            
            // Clear any tentacle slow effect
            if (creature._tentacleSlowed) {
                delete creature._tentacleSlowed;
                delete creature._originalTentacleSpeed;
            }
            
            // Broadcast death to network
            if (this.game.room) {
                this.game.room.updatePresence({
                    ...creature.getPresenceData(),
                    health: 0,
                    isAlive: false
                });
            }
            
            return true; // Player died
        } else {
            // Update presence with new health value
            if (this.game.room) {
                this.game.room.updatePresence({
                    health: creature.health
                });
            }
            
            return false; // Still alive
        }
    }
    
    // Draw health bar for a creature (local or remote/AI)
    drawHealthBar(ctx, creature) {
        if (!creature || !creature.segments || creature.segments.length === 0) return;
        const headSegment = creature.segments[0];
        const x = headSegment.x;
        const y = headSegment.y - CONFIG.SEGMENT_SIZE * 2.3;
        const width = 44;
        const height = 6;
        
        const now = performance.now();
        const isRecentlyDamaged = creature.lastDamaged && (now - creature.lastDamaged < 260);
        
        // Draw background container
        ctx.save();
        ctx.fillStyle = 'rgba(5, 10, 20, 0.75)';
        ctx.fillRect(x - width / 2, y, width, height);
        
        // Health amount clamped [0, 1]
        const maxHealth = CONFIG.MAX_HEALTH || 100;
        const healthVal = typeof creature.health === 'number' ? creature.health : maxHealth;
        const healthPercentage = Math.max(0, Math.min(1, healthVal / maxHealth));
        
        let healthColor = '#22c55e'; // Green
        if (healthPercentage <= 0.3) {
            healthColor = '#ef4444'; // Red
        } else if (healthPercentage <= 0.6) {
            healthColor = '#eab308'; // Amber yellow
        }
        
        // Flash white when hit
        if (isRecentlyDamaged) {
            healthColor = '#ffffff';
        }
        
        // Fill health bar
        ctx.fillStyle = healthColor;
        ctx.fillRect(x - width / 2 + 1, y + 1, Math.max(0, (width - 2) * healthPercentage), height - 2);
        
        // Border outline
        ctx.strokeStyle = isRecentlyDamaged ? '#ff4444' : 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - width / 2, y, width, height);
        ctx.restore();
    }
}
