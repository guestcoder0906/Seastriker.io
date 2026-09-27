import { CONFIG } from '../core/config.js';

export class PlayerController {
    constructor(game) {
        this.game = game;
        this.recentCollisions = {};
    }

    handleCollisionRequest(updateRequest, fromClientId) {
        // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
        if (updateRequest.type === 'collision' || updateRequest.type === 'bodyHit') {
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(this.game.creature)) {
                return;
            }
        }

        if (updateRequest.type === 'collision') {
            // Handle collision with another player's tusk
            const damageAmount = updateRequest.damageAmount || 0;
            const isDead = this.game.healthSystem.processDamage(
                updateRequest.hitType, 
                damageAmount,
                fromClientId
            );
            
            if (isDead && fromClientId) {
                // Only send this once, with explicit amount of 1
                this.game.room.requestPresenceUpdate(fromClientId, {
                    type: 'incrementKills',
                    amount: 1,
                    targetId: this.game.creature.id, // Add target ID to prevent duplicate processing
                    killedUpgrades: this.game.creature.upgrades // Send killed player's upgrades
                });
            }
        } 
        else if (updateRequest.type === 'tuskCollision') {
            // Handle tusk-to-tusk collision
            const knockbackAngle = updateRequest.fromAngle;
            this.game.creature.velocity.x += Math.cos(knockbackAngle) * updateRequest.knockbackForce;
            this.game.creature.velocity.y += Math.sin(knockbackAngle) * updateRequest.knockbackForce;
            
            // Update our presence with new velocity
            this.game.room.updatePresence({
                ...this.game.creature.getPresenceData(),
                velocity: this.game.creature.velocity
            });
        }
        else if (updateRequest.type === 'bodyHit') {
            // Handle being hit by another creature
            const knockbackAngle = updateRequest.knockbackAngle;
            this.game.creature.velocity.x += Math.cos(knockbackAngle) * updateRequest.knockbackForce;
            this.game.creature.velocity.y += Math.sin(knockbackAngle) * updateRequest.knockbackForce;
            
            // Process damage based on where the hit occurred
            const isDead = this.game.healthSystem.processDamage(
                updateRequest.hitType, 
                updateRequest.damageAmount,
                fromClientId
            );
            
            if (isDead && fromClientId) {
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(fromClientId, {
                        type: 'incrementKills',
                        amount: 1,
                        targetId: this.game.creature.id,
                        killedUpgrades: this.game.creature.upgrades
                    });
                }
            }
            
            // Update our presence with new velocity
            this.game.room.updatePresence({
                ...this.game.creature.getPresenceData(),
                velocity: this.game.creature.velocity
            });
        }
        else if (updateRequest.type === 'incrementKills') {
            // We've killed another player, increment our kill count
            this.game.creature.kills++;
            
            // Track kill for skin unlocks using the new system
            if (this.game.skinUnlockSystem && this.game.creature.type) {
                this.game.skinUnlockSystem.trackKill(this.game.creature.type);
            }
            
            // Update our presence with new kill count
            this.game.room.updatePresence({
                kills: this.game.creature.kills
            });
        }
        else if (updateRequest.type === 'tentacleHit') {
            // Handle being caught in squid tentacles
            const damageAmount = updateRequest.damageAmount || 0;
            
            // Process damage
            this.game.healthSystem.processDamage(
                updateRequest.hitType, 
                damageAmount,
                fromClientId
            );
            
            // Apply speed reduction if not already slowed
            if (!this.game.creature._tentacleSlowed) {
                this.game.creature._originalTentacleSpeed = this.game.creature.speed;
                this.game.creature.speed = this.game.creature._originalTentacleSpeed * (updateRequest.speedReduction || 0.5);
                this.game.creature._tentacleSlowed = true;
            }
        }
        else if (updateRequest.type === 'restoreSpeed') {
            // Restore speed after escaping tentacles
            if (this.game.creature._tentacleSlowed) {
                this.game.creature.speed = this.game.creature._originalTentacleSpeed;
                delete this.game.creature._tentacleSlowed;
                delete this.game.creature._originalTentacleSpeed;
            }
        }
        else if (updateRequest.type === 'spawnInkCloud' && updateRequest.cloud) {
            if (this.game.inkSystem) {
                this.game.inkSystem.addRemoteInkCloud(updateRequest.cloud);
            }
        }
        else if (updateRequest.type === 'inkEffect') {
            if (this.game.creature && this.game.inkSystem) {
                this.game.inkSystem.applyInkEffect(this.game.creature, this.game.room.clientId);
                setTimeout(() => {
                    if (this.game.creature && this.game.inkSystem) {
                        this.game.inkSystem.removeInkEffect(this.game.creature, this.game.room.clientId);
                    }
                }, updateRequest.duration || 4000);
            }
        }
    }

    checkCollisions() {
        // Only check collisions if local player is alive
        if (!this.game.creature.isAlive) return;
        
        // Use the NarwhalCollisions helper to check segment collisions
        this.game.narwhalCollisions.checkSegmentCollisions(this.game.creature, this.game.playerPresences);
        
        // Different collision handling based on creature type
        if (this.game.creature.type === 'narwhal') {
            this.checkNarwhalCollisions();
        } else if (this.game.creature.type === 'dolphin') {
            this.checkDolphinCollisions();
        } else if (this.game.creature.type === 'shark') {
            this.checkSharkCollisions();
        } else if (this.game.creature.type === 'squid') {
            this.checkSquidCollisions();
        } else if (this.game.creature.type === 'knifefish') {
            this.checkKnifeFishCollisions();
        }
    }
    
    dispatchAttackToTarget(clientId, damage, hitType, isLethal, angle, knockbackForce = 6) {
        if (!clientId || clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
            return;
        }

        const isAITarget = clientId.startsWith('ai-');
        if (isAITarget) {
            if (this.game.room && typeof this.game.room.attackBot === 'function') {
                this.game.room.attackBot(clientId, damage, hitType, angle);
            }
            const aiPlayer = this.game.aiController?.aiPlayers?.[clientId];
            if (aiPlayer) {
                const killed = this.game.aiHealthSystem.processAIDamage(
                    aiPlayer,
                    isLethal ? 'lethal' : hitType,
                    damage,
                    this.game.creature.id
                );
                if (killed) {
                    this.game.creature.kills++;
                }
            }
        } else {
            if (this.game.room && typeof this.game.room.attackPlayer === 'function') {
                this.game.room.attackPlayer(clientId, damage, hitType, angle, knockbackForce);
            }
            if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                this.game.room.requestPresenceUpdate(clientId, {
                    type: isLethal ? 'collision' : 'bodyHit',
                    hitType: hitType,
                    damageAmount: damage,
                    killed: isLethal,
                    knockbackAngle: angle,
                    knockbackForce
                });
            }
        }

        this.game.room.updatePresence({
            ...this.game.creature.getPresenceData(),
            kills: this.game.creature.kills
        });
    }

    checkNarwhalCollisions() {
        // Check tusk collisions using the collision helper
        const collisionResult = this.game.narwhalCollisions.checkTuskNarwhalCollisions(
            this.game.creature, 
            this.game.playerPresences
        );
        
        if (collisionResult) {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            
            // Cannot attack creatures hiding inside coral reefs since they are protected
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            if (collisionResult.type === 'tuskToTusk') {
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(clientId, {
                        type: 'tuskCollision',
                        fromAngle: this.game.creature.rotationAngle,
                        knockbackForce: collisionResult.knockbackForce
                    });
                }
            } else if (collisionResult.type === 'lethal') {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    'lethal',
                    true,
                    this.game.creature.rotationAngle,
                    8
                );
            } else {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    collisionResult.type,
                    false,
                    this.game.creature.rotationAngle,
                    Math.min(8, (this.game.creature.velocity.x**2 + this.game.creature.velocity.y**2) / 2)
                );
            }
        }
    }
    
    checkSharkCollisions() {
        // For sharks, we use their built-in collision detection
        const collisionResult = this.game.creature.checkSharkCollisions(this.game.playerPresences);
        
        if (collisionResult && typeof collisionResult === 'object') {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            
            // Cannot attack creatures hiding inside coral reefs since they are protected
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            if (collisionResult.type === 'lethal') {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    'lethal',
                    true,
                    this.game.creature.rotationAngle,
                    8
                );
            } else {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    collisionResult.type,
                    false,
                    this.game.creature.rotationAngle,
                    Math.min(8, (this.game.creature.velocity.x**2 + this.game.creature.velocity.y**2) / 2)
                );
            }
        }
    }
    
    checkKnifeFishCollisions() {
        // Check collisions using the knife fish's own collision detection
        const collisionResult = this.game.creature.checkKnifeFishCollisions(this.game.playerPresences);
        
        if (collisionResult && typeof collisionResult === 'object') {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            
            // Cannot attack creatures hiding inside coral reefs since they are protected
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            if (collisionResult.type === 'lethal') {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    'lethal',
                    true,
                    this.game.creature.rotationAngle,
                    8
                );
            } else {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    collisionResult.type,
                    false,
                    this.game.creature.rotationAngle,
                    Math.min(8, (this.game.creature.velocity.x**2 + this.game.creature.velocity.y**2) / 2)
                );
            }
        }
    }

    checkDolphinCollisions() {
        if (!this.game.creature.checkDolphinCollisions) return;
        const collisionResult = this.game.creature.checkDolphinCollisions(this.game.playerPresences);
        
        if (collisionResult && typeof collisionResult === 'object') {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            if (collisionResult.type === 'lethal') {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    'lethal',
                    true,
                    this.game.creature.rotationAngle,
                    8
                );
            } else if (collisionResult.type === 'tailSnap') {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    'tailSnap',
                    false,
                    collisionResult.fromAngle || this.game.creature.rotationAngle,
                    8
                );
            } else {
                this.dispatchAttackToTarget(
                    clientId,
                    collisionResult.damage,
                    collisionResult.type,
                    false,
                    this.game.creature.rotationAngle,
                    4
                );
            }
        }
    }

    checkSquidCollisions() {
        if (this.game.squidAbilities) {
            if (typeof this.game.squidAbilities.checkTentacleHitboxes === 'function') {
                this.game.squidAbilities.checkTentacleHitboxes(this.game.creature);
            } else if (typeof this.game.squidAbilities.updateTentacles === 'function') {
                this.game.squidAbilities.updateTentacles(this.game.creature);
            }
        }

        // Head ram / dash collision for squid and octopus
        const squid = this.game.creature;
        if (!squid || !squid.isAlive || !squid.segments || squid.segments.length === 0) return;

        const now = performance.now();
        const head = squid.segments[0];
        const headRadius = (head.scale || 1.0) * CONFIG.SEGMENT_SIZE * 0.8;

        for (const clientId in this.game.playerPresences) {
            if (clientId === squid.id) continue;
            if (this.recentCollisions[clientId] && (now - this.recentCollisions[clientId] < (CONFIG.COLLISION_COOLDOWN || 1000))) continue;

            const target = this.game.playerPresences[clientId];
            if (!target || !target.segments || target.segments.length === 0) continue;
            if (target.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(target))) continue;

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(target)) continue;

            let hit = false;
            for (let j = 0; j < target.segments.length; j++) {
                const targetSeg = target.segments[j];
                const targetRadius = (targetSeg.scale || 1.0) * (CONFIG.SEGMENT_SIZE * 0.5);
                const dist = Math.hypot(head.x - targetSeg.x, head.y - targetSeg.y);
                if (dist < headRadius + targetRadius) {
                    hit = true;
                    break;
                }
            }

            if (hit) {
                this.recentCollisions[clientId] = now;
                const isOctopus = squid.skinId === 'octopus';
                const baseDamage = isOctopus ? (CONFIG.OCTOPUS_HEAD_DAMAGE || 20) : (CONFIG.SQUID_TENTACLE_DAMAGE || 25);
                const damage = squid.isDashing ? Math.round(baseDamage * 1.25) : baseDamage;

                this.dispatchAttackToTarget(
                    clientId,
                    damage,
                    'bodyHit',
                    false,
                    squid.rotationAngle,
                    6
                );
            }
        }
    }
}