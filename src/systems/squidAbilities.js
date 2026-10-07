import { CONFIG } from '../core/config.js';

export class SquidAbilities {
    constructor(game) {
        this.game = game;
        this.affectedPlayers = {};
        this.tentacleHitboxes = {};
    }

    updateInkStamina(squid, deltaTime) {
        if (!squid || !squid.isAlive) return squid;

        // Octopus uses camouflage instead of ink
        if (squid.skinId === 'octopus') {
            squid.inkReady = false;
            squid.inkCooldown = 0;
            delete squid._inkFiredTime;
            return squid;
        }

        // Standardize deltaTime to milliseconds (deltaTime could be in seconds like 0.0166s or frames like 1.0)
        let dtMs = 1000 / 60; // default 16.67ms
        if (typeof deltaTime === 'number' && Number.isFinite(deltaTime) && deltaTime > 0) {
            if (deltaTime < 0.5) {
                // deltaTime is in seconds (e.g. 0.01667)
                dtMs = deltaTime * 1000;
            } else if (deltaTime <= 10) {
                // deltaTime is in frame count (e.g. 1.0 or 2.0 steps)
                dtMs = deltaTime * (1000 / 60);
            } else {
                // deltaTime is already in milliseconds
                dtMs = deltaTime;
            }
        }

        const baseCooldown = CONFIG.SQUID_INK_COOLDOWN || 7000;
        const modifier = (typeof squid.inkCooldownModifier === 'number' && squid.inkCooldownModifier > 0)
            ? squid.inkCooldownModifier
            : 1.0;
        const cooldownDuration = baseCooldown / modifier;

        // If ink is ready, ensure cooldown values are clean
        if (squid.inkReady) {
            squid.inkCooldown = 0;
            delete squid._inkFiredTime;
            return squid;
        }

        // Safety fallback 1: wall-clock timestamp guarantees ink ALWAYS regenerates
        // even during background tab throttling, lag spikes, or delta time anomalies
        if (squid._inkFiredTime) {
            const elapsed = performance.now() - squid._inkFiredTime;
            if (elapsed >= cooldownDuration) {
                squid.inkReady = true;
                squid.inkCooldown = 0;
                delete squid._inkFiredTime;
                return squid;
            }
        }

        // Safety fallback 2: recover if inkReady is false but cooldown is invalid or depleted
        if (!Number.isFinite(squid.inkCooldown) || squid.inkCooldown <= 0) {
            if (!squid._inkFiredTime) {
                squid.inkReady = true;
                squid.inkCooldown = 0;
                return squid;
            }
        }

        // Decrement cooldown using standardized milliseconds
        const reduction = dtMs * modifier;
        squid.inkCooldown = Math.max(0, (squid.inkCooldown || cooldownDuration) - reduction);

        if (squid.inkCooldown <= 0) {
            squid.inkReady = true;
            squid.inkCooldown = 0;
            delete squid._inkFiredTime;
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
        const presences = this.game.interpolatedPresences || this.game.playerPresences;
        for (const clientId in presences) {
            // Skip self
            if (clientId === squid.id) continue;
            
            const presence = presences[clientId];
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
            damageAmount = CONFIG.OCTOPUS_HEAD_DAMAGE || 15;
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
            // Human player in multiplayer: only real human players send network attacks to remote players
            // Local AI squids must NEVER send network damage to remote players
            if (squid && squid.id && !squid.id.startsWith('ai-') && canDamage) {
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