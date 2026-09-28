import { CONFIG } from '../core/config.js';

export class PlayerController {
    constructor(game) {
        this.game = game;
        this.recentCollisions = {};
    }

    handleCollisionRequest(updateRequest, fromClientId) {
        if (!this.game.creature || !this.game.creature.isAlive) return;

        // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
        if (updateRequest.type === 'collision' || updateRequest.type === 'bodyHit' || updateRequest.type === 'tentacleHit') {
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(this.game.creature)) {
                return;
            }
        }

        if (updateRequest.type === 'collision' || updateRequest.type === 'bodyHit') {
            const damageAmount = updateRequest.damageAmount || 0;
            const hitType = updateRequest.hitType || (updateRequest.type === 'collision' ? 'headHit' : 'bodyHit');

            if (updateRequest.knockbackAngle !== undefined && updateRequest.knockbackForce) {
                this.game.creature.velocity.x += Math.cos(updateRequest.knockbackAngle) * updateRequest.knockbackForce;
                this.game.creature.velocity.y += Math.sin(updateRequest.knockbackAngle) * updateRequest.knockbackForce;
            }

            const victimId = this.game.creature.id;
            const victimName = this.game.creature.name || "Player";
            const victimUpgrades = this.game.creature.upgrades;

            const isDead = this.game.healthSystem.processDamage(
                hitType, 
                damageAmount,
                fromClientId
            );
            
            if (isDead && fromClientId) {
                const killToken = `${fromClientId}_${victimId}_${Date.now()}`;
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(fromClientId, {
                        type: 'incrementKills',
                        killToken,
                        victimId: victimId,
                        victimName: victimName,
                        killedUpgrades: victimUpgrades
                    });
                }
            } else if (!isDead && this.game.creature && this.game.creature.isAlive && this.game.room) {
                this.game.room.updatePresence({
                    ...this.game.creature.getPresenceData(),
                    velocity: this.game.creature.velocity
                });
            }
        } 
        else if (updateRequest.type === 'tuskCollision') {
            // Handle tusk-to-tusk collision
            const knockbackAngle = updateRequest.fromAngle;
            this.game.creature.velocity.x += Math.cos(knockbackAngle) * updateRequest.knockbackForce;
            this.game.creature.velocity.y += Math.sin(knockbackAngle) * updateRequest.knockbackForce;
            
            if (this.game.room) {
                this.game.room.updatePresence({
                    ...this.game.creature.getPresenceData(),
                    velocity: this.game.creature.velocity
                });
            }
        }
        else if (updateRequest.type === 'incrementKills') {
            const killToken = updateRequest.killToken || `${fromClientId}_${updateRequest.victimId || 'victim'}`;
            if (!this.game._processedKillTokens) {
                this.game._processedKillTokens = new Set();
            }
            if (this.game._processedKillTokens.has(killToken)) {
                return; // Prevent duplicate award
            }
            this.game._processedKillTokens.add(killToken);

            const victimName = updateRequest.victimName || "Player";
            this.game.awardKill(victimName, updateRequest.killedUpgrades);
        }
        else if (updateRequest.type === 'tentacleHit') {
            const damageAmount = updateRequest.damageAmount || 0;
            const victimId = this.game.creature.id;
            const victimName = this.game.creature.name || "Player";
            const victimUpgrades = this.game.creature.upgrades;

            const isDead = this.game.healthSystem.processDamage(
                updateRequest.hitType || 'tentacleHit', 
                damageAmount,
                fromClientId
            );

            if (isDead && fromClientId) {
                const killToken = `${fromClientId}_${victimId}_${Date.now()}`;
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(fromClientId, {
                        type: 'incrementKills',
                        killToken,
                        victimId: victimId,
                        victimName: victimName,
                        killedUpgrades: victimUpgrades
                    });
                }
            }
            
            if (!isDead && this.game.creature && !this.game.creature._tentacleSlowed) {
                this.game.creature._originalTentacleSpeed = this.game.creature.speed;
                this.game.creature.speed = this.game.creature._originalTentacleSpeed * (updateRequest.speedReduction || 0.5);
                this.game.creature._tentacleSlowed = true;
            }
        }
        else if (updateRequest.type === 'restoreSpeed') {
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
        if (!this.game.creature || !this.game.creature.isAlive) return;
        
        this.game.narwhalCollisions.checkSegmentCollisions(this.game.creature, this.game.playerPresences);
        
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
    
    checkNarwhalCollisions() {
        const collisionResult = this.game.narwhalCollisions.checkTuskNarwhalCollisions(
            this.game.creature, 
            this.game.playerPresences
        );
        
        if (collisionResult) {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            const isAITarget = clientId.startsWith('ai-');
            
            if (collisionResult.type === 'tuskToTusk') {
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(clientId, {
                        type: 'tuskCollision',
                        fromAngle: this.game.creature.rotationAngle,
                        knockbackForce: collisionResult.knockbackForce
                    });
                }
            }
            else {
                if (isAITarget) {
                    const aiPlayer = this.game.aiController.aiPlayers[clientId];
                    if (aiPlayer) {
                        const killed = this.game.aiHealthSystem.processAIDamage(
                            aiPlayer, 
                            collisionResult.type,
                            collisionResult.damage, 
                            this.game.creature.id
                        );
                        if (killed) {
                            this.game.awardKill(aiPlayer.creature?.name || "AI Narwhal");
                        }
                    }
                } else {
                    if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                        this.game.room.requestPresenceUpdate(clientId, {
                            type: 'collision',
                            hitType: collisionResult.type,
                            damageAmount: collisionResult.damage,
                            segmentIndex: collisionResult.segment,
                            knockbackAngle: this.game.creature.rotationAngle,
                            knockbackForce: Math.min(10, (this.game.creature.velocity.x**2 + this.game.creature.velocity.y**2)) / 2
                        });
                    }
                }
            }
        }
    }
    
    checkSharkCollisions() {
        const collisionResult = this.game.creature.checkSharkCollisions(this.game.playerPresences);
        
        if (collisionResult && typeof collisionResult === 'object') {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            const isAITarget = clientId.startsWith('ai-');
            
            if (isAITarget) {
                const aiPlayer = this.game.aiController.aiPlayers[clientId];
                if (aiPlayer) {
                    const killed = this.game.aiHealthSystem.processAIDamage(
                        aiPlayer, 
                        collisionResult.type,
                        collisionResult.damage, 
                        this.game.creature.id
                    );
                    if (killed) {
                        this.game.awardKill(aiPlayer.creature?.name || "AI Shark");
                    }
                }
            } else {
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(clientId, {
                        type: 'bodyHit',
                        hitType: collisionResult.type,
                        damageAmount: collisionResult.damage,
                        knockbackAngle: this.game.creature.rotationAngle,
                        knockbackForce: Math.min(10, (this.game.creature.velocity.x**2 + this.game.creature.velocity.y**2)) / 2
                    });
                }
            }
        }
    }
    
    checkKnifeFishCollisions() {
        const collisionResult = this.game.creature.checkKnifeFishCollisions(this.game.playerPresences);
        
        if (collisionResult && typeof collisionResult === 'object') {
            const clientId = collisionResult.clientId;
            if (clientId === this.game.room?.clientId || (this.game.creature && clientId === this.game.creature.id)) {
                return;
            }
            
            const targetPresence = this.game.playerPresences[clientId];
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            const isAITarget = clientId.startsWith('ai-');
            
            if (isAITarget) {
                const aiPlayer = this.game.aiController.aiPlayers[clientId];
                if (aiPlayer) {
                    const killed = this.game.aiHealthSystem.processAIDamage(
                        aiPlayer, 
                        collisionResult.type,
                        collisionResult.damage, 
                        this.game.creature.id
                    );
                    if (killed) {
                        this.game.awardKill(aiPlayer.creature?.name || "AI Knifefish");
                    }
                }
            } else {
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(clientId, {
                        type: 'bodyHit',
                        hitType: collisionResult.type,
                        damageAmount: collisionResult.damage,
                        knockbackAngle: this.game.creature.rotationAngle,
                        knockbackForce: Math.min(8, (this.game.creature.velocity.x**2 + this.game.creature.velocity.y**2)) / 2
                    });
                }
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

            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            const isAITarget = clientId.startsWith('ai-');

            if (isAITarget) {
                const aiPlayer = this.game.aiController.aiPlayers[clientId];
                if (aiPlayer) {
                    const killed = this.game.aiHealthSystem.processAIDamage(
                        aiPlayer,
                        collisionResult.type,
                        collisionResult.damage,
                        this.game.creature.id
                    );
                    if (killed) {
                        this.game.awardKill(aiPlayer.creature?.name || "AI Dolphin");
                    }
                    const knockbackAngle = collisionResult.fromAngle || this.game.creature.rotationAngle;
                    aiPlayer.creature.velocity.x += Math.cos(knockbackAngle) * 8;
                    aiPlayer.creature.velocity.y += Math.sin(knockbackAngle) * 8;
                }
            } else {
                if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                    this.game.room.requestPresenceUpdate(clientId, {
                        type: 'bodyHit',
                        hitType: collisionResult.type,
                        damageAmount: collisionResult.damage,
                        knockbackAngle: collisionResult.fromAngle || this.game.creature.rotationAngle,
                        knockbackForce: collisionResult.type === 'tailSnap' ? 8 : 4
                    });
                }
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
                const isAITarget = clientId.startsWith('ai-');
                const isOctopus = squid.skinId === 'octopus';
                const baseDamage = isOctopus ? (CONFIG.OCTOPUS_HEAD_DAMAGE || 20) : (CONFIG.SQUID_TENTACLE_DAMAGE || 25);
                const damage = squid.isDashing ? Math.round(baseDamage * 1.25) : baseDamage;

                if (isAITarget) {
                    const aiPlayer = this.game.aiController.aiPlayers[clientId];
                    if (aiPlayer) {
                        const killed = this.game.aiHealthSystem.processAIDamage(
                            aiPlayer,
                            'bodyHit',
                            damage,
                            squid.id
                        );
                        if (killed) {
                            this.game.awardKill(aiPlayer.creature?.name || (isOctopus ? "AI Octopus" : "AI Squid"));
                        }
                    }
                } else {
                    if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                        this.game.room.requestPresenceUpdate(clientId, {
                            type: 'bodyHit',
                            hitType: 'bodyHit',
                            damageAmount: damage,
                            knockbackAngle: squid.rotationAngle,
                            knockbackForce: 4.5
                        });
                    }
                }
            }
        }
    }
}