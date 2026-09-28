import { CONFIG } from '../core/config.js';

export class SquidAbilities {
    constructor(game) {
        this.game = game;
        this.affectedPlayers = {};
        this.tentacleHitboxes = {};
    }

    updateInkStamina(squid, deltaTime) {
        // Update ink stamina cooldown
        if (!squid.inkReady && squid.inkCooldown > 0) {
            // Apply modifier if available (for faster ink regeneration)
            if (squid.inkCooldownModifier) {
                const reduction = deltaTime * squid.inkCooldownModifier;
                squid.inkCooldown -= reduction;
            } else {
                squid.inkCooldown -= deltaTime;
            }
            
            if (squid.inkCooldown <= 0) {
                squid.inkReady = true;
                squid.inkCooldown = 0;
            }
        }
        return squid;
    }

    updateTentacles(squid) {
        return this.checkTentacleHitboxes(squid);
    }

    checkTentacleHitboxes(squid) {
        if (!squid || !squid.isAlive || !squid.tentacles) return;
        
        // Create hitbox area covering tentacles
        const tentacleArea = this.calculateTentacleHitbox(squid);
        
        let playerInTentacles = false;
        
        // Check all players against tentacle hitbox
        for (const clientId in this.game.playerPresences) {
            // Skip self
            if (clientId === squid.id) continue;
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;
            
            // Skip if target is protected inside coral reef
            if (presence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(presence))) {
                continue;
            }

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(presence)) {
                continue;
            }
            
            // Check if player's head is in tentacle area
            if (this.isPointInPolygon(presence.segments[0].x, presence.segments[0].y, tentacleArea)) {
                playerInTentacles = true;
                
                // Store info about affected player
                if (!this.tentacleHitboxes[clientId]) {
                    this.tentacleHitboxes[clientId] = {
                        squidId: squid.id,
                        lastHitTime: performance.now(),
                        lastDamageTime: 0,
                        escapeTime: 0
                    };
                } else {
                    this.tentacleHitboxes[clientId].lastHitTime = performance.now();
                    this.tentacleHitboxes[clientId].escapeTime = 0;
                }
                
                // Apply tentacle effects (damage and slow)
                this.applyTentacleEffects(squid, clientId);
            } else if (this.tentacleHitboxes[clientId] && this.tentacleHitboxes[clientId].squidId === squid.id) {
                // Player escaped tentacles
                if (this.tentacleHitboxes[clientId].escapeTime === 0) {
                    this.tentacleHitboxes[clientId].escapeTime = performance.now();
                } else if (performance.now() - this.tentacleHitboxes[clientId].escapeTime > 1000) {
                    // After 1 second of being out of tentacles, remove effect
                    if (this.game.octopusTentacleEffect) {
                        this.game.octopusTentacleEffect.removeEffect(clientId);
                    }
                    delete this.tentacleHitboxes[clientId];
                }
            }
        }
        
        // If no players in tentacles, restore squid speed
        if (!playerInTentacles && squid._tentacleSlowed) {
            squid.speed = squid._originalTentacleSpeed;
            delete squid._tentacleSlowed;
            delete squid._originalTentacleSpeed;
        }
    }
    
calculateTentacleHitbox(squid) {
    if (!squid.segments || squid.segments.length === 0) return [];

    const head = squid.segments[0];

    const rectWidth = 100;   // Width of the tentacle area (adjust as needed)
    const rectHeight = 150;  // Height extending downward (adjust as needed)

    return [
        { x: head.x - rectWidth / 2, y: head.y },                // top-left
        { x: head.x + rectWidth / 2, y: head.y },                // top-right
        { x: head.x + rectWidth / 2, y: head.y + rectHeight },   // bottom-right
        { x: head.x - rectWidth / 2, y: head.y + rectHeight }    // bottom-left
    ];
}

    isPointInPolygon(x, y, polygon) {
        if (polygon.length < 3) return false;
        
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
            if (intersect) inside = !inside;
        }
        
        return inside;
    }
    
    applyTentacleEffects(squid, targetId) {
        if (!this.tentacleHitboxes[targetId]) {
            this.tentacleHitboxes[targetId] = {
                squidId: squid ? squid.id : null,
                lastHitTime: performance.now(),
                lastDamageTime: 0,
                escapeTime: 0
            };
        }

        // Apply slow effect to squid with player in tentacles
        if (!squid._tentacleSlowed) {
            squid._originalTentacleSpeed = squid.speed;
            squid.speed = squid._originalTentacleSpeed * 0.5;
            squid._tentacleSlowed = true;
        }
        
        // Calculate damage amount based on squid's damage modifier or octopus head attack
        let damageAmount = CONFIG.SQUID_TENTACLE_DAMAGE;
        if (squid.tentacleDamageModifier) {
            damageAmount *= squid.tentacleDamageModifier;
        }
        if (squid.skinId === 'octopus') {
            damageAmount = CONFIG.OCTOPUS_HEAD_DAMAGE || 20;
        }
        
        const tickInterval = 600; // Balanced interval between damage ticks
        const now = performance.now();
        const hitboxInfo = this.tentacleHitboxes[targetId];
        const canDamage = !hitboxInfo.lastDamageTime || (now - hitboxInfo.lastDamageTime > tickInterval);
        
        // Apply damage and slow effect to trapped player
        const isLocalTarget = targetId === this.game.room.clientId || (this.game.creature && targetId === this.game.creature.id);
        if (isLocalTarget) {
            // Apply slow effect to local player using the new system
            if (this.game.octopusTentacleEffect && this.game.creature) {
                this.game.octopusTentacleEffect.applySlow(this.game.creature, squid.id);
            }
            
            if (canDamage) {
                hitboxInfo.lastDamageTime = now;
                this.game.healthSystem.processDamage("tentacleHit", damageAmount, squid.id);
            }
        } else if (targetId.startsWith('ai-') && this.game.aiController?.aiPlayers?.[targetId]) {
            // Apply slow effect to AI player
            const aiCreature = this.game.aiController.aiPlayers[targetId].creature;
            if (this.game.octopusTentacleEffect && aiCreature) {
                this.game.octopusTentacleEffect.applySlow(aiCreature, squid.id);
            }
            
            if (canDamage) {
                hitboxInfo.lastDamageTime = now;
                this.game.aiHealthSystem.processAIDamage(
                    this.game.aiController.aiPlayers[targetId],
                    "tentacleHit",
                    damageAmount,
                    squid.id
                );
            }
        } else {
            // Human player in multiplayer - send damage and slow effect request
            if (canDamage) {
                hitboxInfo.lastDamageTime = now;
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(targetId, {
                        type: 'tentacleHit',
                        hitType: 'tentacleHit',
                        damageAmount: damageAmount,
                        speedReduction: 0.4
                    });
                }
            }
        }
    }
    
    removeTentacleEffect(clientId) {
        if (clientId === this.game.room.clientId && this.game.creature._tentacleSlowed) {
            // Restore speed for local player
            this.game.creature.speed = this.game.creature._originalTentacleSpeed;
            delete this.game.creature._tentacleSlowed;
            delete this.game.creature._originalTentacleSpeed;
        } else if (clientId.startsWith('ai-') && 
                  this.game.aiController.aiPlayers[clientId] && 
                  this.game.aiController.aiPlayers[clientId].creature._tentacleSlowed) {
            // Restore speed for AI
            const aiCreature = this.game.aiController.aiPlayers[clientId].creature;
            aiCreature.speed = aiCreature._originalTentacleSpeed;
            delete aiCreature._tentacleSlowed;
            delete aiCreature._originalTentacleSpeed;
        } else {
            // For other human players, send request to restore speed
            this.game.room.requestPresenceUpdate(clientId, {
                type: 'restoreSpeed'
            });
        }
    }
}