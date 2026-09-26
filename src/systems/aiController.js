import { CONFIG } from '../core/config.js';
import { CreatureFactory } from '../entities/creatureFactory.js';
import { AIAggression } from './aiAggression.js';
import { NarwhalSpeed } from './narwhalSpeed.js';

export class AIController {
    constructor(game) {
        this.game = game;
        this.aiPlayers = {};
        this.aiCount = 0;
        this.targetAICount = Math.floor(5 + Math.random() * 6); // 5-10 players
        this.aiNames = [
            "BotNarwhal", "AIcebreaker", "DeepDiver", "TuskMaster", 
            "OceanBot", "SeaExplorer", "NarBot", "TuskTech",
            "WaveRider", "DeepBlue", "SilverFin", "AquaBot"
        ];
        this.lastAIUpdate = {};
        this.decisionCooldowns = {};
        this.aiPresences = {}; // Store AI presences separately to avoid flickering
        
        // Create instance of AI Aggression helper
        this.aiAggression = new AIAggression(game);
        
        this.narwhalSpeed = new NarwhalSpeed();
    }

    update() {
        // Manage AI player count to dynamically adjust based on real players
        this.manageAIPlayerCount();

        // Update each AI player
        for (const aiId in this.aiPlayers) {
            // Add some randomness to AI updates to prevent synchronized behavior
            if (!this.lastAIUpdate[aiId]) {
                this.lastAIUpdate[aiId] = 0;
            }
            
            // Update AI more frequently for better responsiveness
            if (performance.now() - this.lastAIUpdate[aiId] > 30) { // Update every 30ms instead of 50ms
                this.updateAIPlayer(aiId);
                this.lastAIUpdate[aiId] = performance.now();
            }
        }
    }

    manageAIPlayerCount() {
        // Count real players
        const realPlayerCount = Object.keys(this.game.playerPresences || {}).filter(id => !id.startsWith('ai-')).length;

        // Define minimum and maximum total players in CONFIG (now lowered so NPCs are less common)
        const minTotalPlayers = CONFIG.MIN_TOTAL_PLAYERS;
        const maxTotalPlayers = CONFIG.MAX_TOTAL_PLAYERS;

        // Determine how many AI players we need to reach the minimum total
        const minAINeeded = Math.max(0, minTotalPlayers - realPlayerCount);
        // Don't exceed maximum total players
        const maxAIAllowed = Math.max(0, maxTotalPlayers - realPlayerCount);

        // Target a number of AI between min needed and max allowed
        const desiredAICount = Math.min(maxAIAllowed, Math.max(minAINeeded,
            Math.floor(minAINeeded + (maxAIAllowed - minAINeeded) * 0.7)));

        // Add AI players if needed
        if (Object.keys(this.aiPlayers).length < desiredAICount) {
            this.addAIPlayer(realPlayerCount);
        }

        // Count small AI creatures (squid and knifefish)
        const smallAIIds = Object.keys(this.aiPlayers).filter(id => {
            const type = this.aiPlayers[id]?.creature?.type;
            return type === 'squid' || type === 'knifefish';
        });

        // Smaller NPCs scale down as more real players are online
        // When real players >= 1, limit the number of small NPCs permitted
        const maxSmallAIAllowed = Math.max(0, Math.floor(2 - realPlayerCount * 0.7));

        // Remove excess AI players if needed, prioritizing removing smaller NPCs first
        if (Object.keys(this.aiPlayers).length > desiredAICount + 1 && realPlayerCount > 0) {
            // Prioritize removing a small AI creature first
            const aiToRemove = smallAIIds.length > 0 ? smallAIIds[0] : Object.keys(this.aiPlayers)[0];
            this.removeAIPlayer(aiToRemove);
        } else if (realPlayerCount > 0 && smallAIIds.length > maxSmallAIAllowed && Object.keys(this.aiPlayers).length > minAINeeded) {
            // Scale down small NPCs specifically if there are too many for the current real player count
            this.removeAIPlayer(smallAIIds[0]);
        } else if (Object.keys(this.aiPlayers).length > desiredAICount && realPlayerCount === 0 && Object.keys(this.aiPlayers).length > 1) { // Keep at least 1 AI if no real players
            const aiIds = Object.keys(this.aiPlayers);
            const aiToRemove = aiIds[0];
            this.removeAIPlayer(aiToRemove);
        }
    }

    addAIPlayer(realPlayerCount = 0) {
        // Create a unique ID for the AI
        const aiId = `ai-${this.aiCount++}`;
        
        // Select a random name
        const name = this.aiNames[Math.floor(Math.random() * this.aiNames.length)];
        
        // Generate random spawn position (away from borders)
        const margin = 300;
        const x = margin + Math.random() * (CONFIG.WORLD_WIDTH - 2 * margin);
        const y = margin + Math.random() * (CONFIG.WORLD_HEIGHT - 2 * margin);
        
        // Generate random color
        const hue = Math.floor(Math.random() * 360);
        const color = `hsl(${hue}, 70%, 60%)`;
        
        // Create new AI creature (shark, narwhal, or scaled small creature)
        const aiCreature = CreatureFactory.createCreature(aiId, x, y, color, name + " (AI)", realPlayerCount);
        
        // Initialize speed properties
        this.narwhalSpeed.initializeNarwhal(aiCreature);
        
        // Add to AI players collection
        this.aiPlayers[aiId] = {
            creature: aiCreature, 
            target: null,
            state: 'exploring',  
            targetX: x,
            targetY: y,
            mousePressed: false,
            dodgePressed: false,
            lastStateChange: performance.now(),
            lastTargetChange: performance.now(),
            sightRange: CONFIG.AI_SIGHT_RANGE
        };
        
        // Initialize decision cooldowns
        this.decisionCooldowns[aiId] = {
            targetSelection: 0,
            stateChange: 0,
            dodge: 0,
            dash: 0
        };
        
        // Store initial presence data
        this.aiPresences[aiId] = aiCreature.getPresenceData();
        
        // Add to player presences
        this.game.playerPresences[aiId] = this.aiPresences[aiId];
    }

    removeAIPlayer(aiId) {
        // Clean up all references
        delete this.aiPlayers[aiId];
        delete this.game.playerPresences[aiId];
        delete this.lastAIUpdate[aiId];
        delete this.decisionCooldowns[aiId];
        delete this.aiPresences[aiId];
        delete this.game.players[aiId]; // Also remove from players collection
        
        // Also clean any tentacle-related references
        if (this.game.squidAbilities && this.game.squidAbilities.tentacleHitboxes) {
            delete this.game.squidAbilities.tentacleHitboxes[aiId];
        }
        
        // Clean ink effect references if present
        if (this.game.inkSystem && this.game.inkSystem.affectedPlayers) {
            delete this.game.inkSystem.affectedPlayers[aiId];
        }
    }

    updateAIPlayer(aiId) {
        const ai = this.aiPlayers[aiId];
        if (!ai || !ai.creature || !ai.creature.isAlive) return;
        
        // Update cooldowns
        for (const type in this.decisionCooldowns[aiId]) {
            if (this.decisionCooldowns[aiId][type] > 0) {
                this.decisionCooldowns[aiId][type]--;
            }
        }

        // Check for upgrades and apply speed/cooldown modifications
        this.checkUpgrades(ai, aiId);
        
        // Apply stamina cooldown modifier
        if (ai.creature.staminaCooldownModifier !== 1.0) {
            ai.creature.staminaCooldown = Math.floor(CONFIG.STAMINA_COOLDOWN * ai.creature.staminaCooldownModifier / 60);
        }
        
        // Apply speed modifier to AI creature
        ai.creature.speed = this.narwhalSpeed.applySpeedModifier(
            ai.creature, 
            CONFIG.BASE_SPEED
        );
        
        // AI Decision Making
        this.updateAIDecision(ai, aiId);
        
        // Update AI movement and actions
        ai.creature.update(
            ai.targetX,
            ai.targetY,
            ai.mousePressed,
            ai.dodgePressed,
            ai.fastSwimPressed || false,
            this.game.playerPresences
        );
        
        // Update presence data for this AI and store it in our reliable AI presence cache
        this.aiPresences[aiId] = ai.creature.getPresenceData();
        
        // Update the game's player presences with our reliable AI presence
        this.game.playerPresences[aiId] = this.aiPresences[aiId];
        
        // Check for collisions with other players
        this.checkAICollisions(ai, aiId);
    }

    checkUpgrades(ai, aiId) {
        // Check for upgrades based on kill count
        this.game.upgradeSystem.checkUpgrades(ai.creature);
        
        // Apply speed and stamina upgrades by updating creature speed settings
        this.narwhalSpeed.updateSpeedSettings(ai.creature);
    }

    updateAIDecision(ai, aiId) {
        // Only make new decisions when cooldown is over
        if (this.decisionCooldowns[aiId].stateChange <= 0) {
            // Change state with some probability - more aggressive now
            if (Math.random() < 0.05) {
                // Higher chance of chasing (70% now) to make AI more aggressive
                ai.state = Math.random() < 0.3 ? 'exploring' : 'chasing';
                ai.lastStateChange = performance.now();
                this.decisionCooldowns[aiId].stateChange = 30; // Cooldown for state changes
            }
        }
        
        // Target selection
        if (this.decisionCooldowns[aiId].targetSelection <= 0) {
            if (ai.state === 'chasing') {
                // Use the new aggression helper for better targeting
                const isAggressive = this.aiAggression.shouldBeAggressive(ai, aiId);
                if (isAggressive) {
                    const bestTarget = this.aiAggression.findBestTarget(ai, aiId);
                    if (bestTarget) {
                        ai.target = bestTarget;
                        ai.lastTargetChange = performance.now();
                    } else {
                        this.findNearestTarget(ai, aiId);
                    }
                } else {
                    this.findNearestTarget(ai, aiId);
                }
            } else if (ai.state === 'exploring') {
                // Occasionally change exploration target
                if (!ai.targetX || Math.random() < 0.02) {
                    this.setRandomExplorationTarget(ai);
                }
            }
            this.decisionCooldowns[aiId].targetSelection = 15; // Cooldown for target selection
        }
        
        // Update target position
        if (ai.state === 'chasing' && ai.target) {
            // If target is a player ID
            if (typeof ai.target === 'string') {
                const targetPresence = this.game.playerPresences[ai.target];
                if (targetPresence && targetPresence.isAlive) {
                    // Use the new aggression helper for better positioning
                    const attackPosition = this.aiAggression.positionForAttack(ai, targetPresence);
                    
                    if (attackPosition) {
                        ai.targetX = attackPosition.x;
                        ai.targetY = attackPosition.y;
                        
                        // Decide to dash based on new aggression logic
                        const hasStaminaForBurst = ai.creature.stamina !== undefined ? ai.creature.stamina > (2 / 3) : ai.creature.staminaReady;
                        if (this.aiAggression.shouldDash(ai, attackPosition) && 
                            this.decisionCooldowns[aiId].dash <= 0 && 
                            hasStaminaForBurst) {
                            
                            ai.mousePressed = true;
                            this.decisionCooldowns[aiId].dash = 90; // Even shorter cooldown for dash
                            
                            // Reset dash after short duration
                            setTimeout(() => {
                                if (ai && ai.creature) ai.mousePressed = false;
                            }, 300);
                        } else {
                            ai.mousePressed = false;
                        }
                        
                        // Decide to dodge based on new aggression logic
                        const shouldDodge = this.aiAggression.shouldDodge(ai, aiId);
                        if (shouldDodge && this.decisionCooldowns[aiId].dodge <= 0 && 
                            hasStaminaForBurst) {
                            
                            ai.dodgePressed = true;
                            this.decisionCooldowns[aiId].dodge = 90; // Shorter cooldown for dodge
                            
                            // Reset dodge after short duration
                            setTimeout(() => {
                                if (ai && ai.creature) ai.dodgePressed = false;
                            }, 300);
                        } else {
                            ai.dodgePressed = false;
                        }

                        // Fast swim sprint when chasing if stamina permits
                        if (ai.creature.stamina !== undefined && ai.creature.stamina > 0.35 && !ai.creature.isExhausted) {
                            ai.fastSwimPressed = Math.random() < 0.7;
                        } else {
                            ai.fastSwimPressed = false;
                        }
                    } else {
                        // Target went out of sight, return to exploring
                        ai.state = 'exploring';
                        this.setRandomExplorationTarget(ai);
                    }
                } else {
                    // Target is dead or gone, return to exploring
                    ai.state = 'exploring';
                    this.setRandomExplorationTarget(ai);
                }
            }
        }
        
        // Movement for exploration
        if (ai.state === 'exploring') {
            // Check if we've reached the target or are near world boundaries
            const dx = ai.targetX - ai.creature.segments[0].x;
            const dy = ai.targetY - ai.creature.segments[0].y;
            const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
            
            if (distanceToTarget < 50 || this.isNearWorldBoundary(ai.creature)) {
                this.setRandomExplorationTarget(ai);
            }
            
            // Higher chance to use dash while exploring for more dynamic movement
            if (Math.random() < 0.02 && this.decisionCooldowns[aiId].dash <= 0 && 
                ai.creature.staminaReady) {
                
                ai.mousePressed = true;
                this.decisionCooldowns[aiId].dash = 120;
                
                setTimeout(() => {
                    if (ai && ai.creature) ai.mousePressed = false;
                }, 300);
            }
            
            // Dodge obstacles while exploring
            const shouldDodge = this.shouldAIDodge(ai, aiId);
            if (shouldDodge && this.decisionCooldowns[aiId].dodge <= 0 && 
                ai.creature.staminaReady) {
                
                ai.dodgePressed = true;
                this.decisionCooldowns[aiId].dodge = 120;
                
                setTimeout(() => {
                    if (ai && ai.creature) ai.dodgePressed = false;
                }, 300);
            }
        }
        
        // Extra logic for squid AI players 
        if (ai.creature.type === 'squid') {
            // Check if ink is ready and there are targets nearby
            if (ai.creature.inkReady && Math.random() < 0.05) {
                // Find nearby targets within ink effective range
                const nearbyTargets = this.findNearbyTargets(ai, aiId, CONFIG.SQUID_INK_RADIUS * 1.5);
                
                // If there are nearby targets, use ink
                if (nearbyTargets && nearbyTargets.length > 0) {
                    this.game.inkSystem.createInkCloud(ai.creature);
                    
                    // Update AI presence with ink status
                    this.aiPresences[aiId].inkReady = false;
                    this.aiPresences[aiId].inkCooldown = CONFIG.SQUID_INK_COOLDOWN;
                    this.game.playerPresences[aiId] = this.aiPresences[aiId];
                }
            }
            
            // Check tentacle hitboxes
            this.game.squidAbilities.checkTentacleHitboxes(ai.creature);
            
            // AI Octopus camouflage logic
            if (ai.creature.skinId === 'octopus' && ai.creature.camouflageReady && Math.random() < 0.1) {
                // Find nearby targets that might be threats
                const nearbyTargets = this.findNearbyTargets(ai, aiId, CONFIG.AI_SIGHT_RANGE * 0.6);
                
                // If there are nearby threats, use camouflage to hide
                if (nearbyTargets && nearbyTargets.length > 0) {
                    this.game.octopusAbilities.activateCamouflage(ai.creature);
                    
                    // Update AI presence with camouflage status
                    this.aiPresences[aiId].isCamouflaged = true;
                    this.aiPresences[aiId].camouflageReady = false;
                    this.aiPresences[aiId].camouflageActiveTimer = CONFIG.OCTOPUS_CAMOUFLAGE_DURATION;
                    this.aiPresences[aiId].camouflageTimer = 0;
                    
                    this.game.playerPresences[aiId] = this.aiPresences[aiId];
                }
            }
        }
        
        // ... existing code ...
    }

    findNearestTarget(ai, aiId) {
        let nearestDistance = Number.MAX_VALUE;
        let nearestTarget = null;
        
        // Find nearest player that's not the AI itself
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue; // Skip self
            if (clientId.startsWith('ai-') && Math.random() < 0.7) continue; // Prefer targeting real players
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive) continue; // Skip dead players or undefined presences
            
            // Skip if presence doesn't have segments
            if (!presence.segments || !presence.segments[0]) continue;
            
            // Is this player within sight range?
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < ai.sightRange && distance < nearestDistance) {
                nearestDistance = distance;
                nearestTarget = clientId;
            }
        }
        
        // If we found a target, set it
        if (nearestTarget) {
            ai.target = nearestTarget;
            ai.lastTargetChange = performance.now();
        } else {
            // No target in sight, return to exploring
            ai.state = 'exploring';
            this.setRandomExplorationTarget(ai);
        }
    }

    setRandomExplorationTarget(ai) {
        // Set a random position within the world bounds, but avoid edges
        const margin = 200;
        ai.targetX = margin + Math.random() * (CONFIG.WORLD_WIDTH - 2 * margin);
        ai.targetY = margin + Math.random() * (CONFIG.WORLD_HEIGHT - 2 * margin);
        
        // Also reset actions
        ai.mousePressed = false;
        ai.dodgePressed = false;
    }

    shouldAIDodge(ai, aiId) {
        // Check if there are players with tusks pointed at us
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue; // Skip self
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive) continue;
            if (!presence.segments || !presence.segments[0]) continue;
            
            // Calculate distance
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Dodge if a player is close and pointing at us or dashing
            if (distance < 200) {
                // Check if they're facing us or dashing
                const theirAngle = presence.segments[0].angle;
                const angleToUs = Math.atan2(dy, dx);
                
                // Calculate the angular difference
                let angleDiff = Math.abs(theirAngle - angleToUs);
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                angleDiff = Math.abs(angleDiff);
                
                // If they're pointing roughly at us or they're dashing, dodge
                if (angleDiff < 0.8 || presence.isDashing) { // Wider angle (~45 degrees)
                    return true;
                }
            }
        }
        
        return false;
    }

    isNearWorldBoundary(creature) {
        const margin = 100;
        const x = creature.segments[0].x;
        const y = creature.segments[0].y;
        
        return (
            x < margin || 
            x > CONFIG.WORLD_WIDTH - margin || 
            y < margin || 
            y > CONFIG.WORLD_HEIGHT - margin
        );
    }

    checkAICollisions(ai, aiId) {
        // Skip if AI is not alive
        if (!ai || !ai.creature || !ai.creature.isAlive) return;
        
        // Check collisions based on AI creature type
        let collisionResult = null;
        if (ai.creature.type === 'narwhal') {
            collisionResult = this.game.narwhalCollisions.checkTuskNarwhalCollisions(
                ai.creature, 
                this.game.playerPresences
            );
        } else if (ai.creature.type === 'dolphin') {
            collisionResult = ai.creature.checkDolphinCollisions(this.game.playerPresences);
        } else if (ai.creature.type === 'shark') {
            collisionResult = ai.creature.checkSharkCollisions(this.game.playerPresences);
        } else if (ai.creature.type === 'knifefish') {
            collisionResult = ai.creature.checkKnifeFishCollisions(this.game.playerPresences);
        }
        
        if (collisionResult && typeof collisionResult === 'object') {
            // Process collision result
            const targetId = collisionResult.clientId;
            const targetPresence = this.game.playerPresences[targetId];

            // Creatures hiding inside coral reefs cannot be attacked since they are protected
            if (targetPresence && (targetPresence.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(targetPresence)))) {
                return;
            }

            // While octopus is camouflaged, attacks/damage done to it only happen 50% of the time
            if (this.game.octopusAbilities && this.game.octopusAbilities.shouldEvadeAttack(targetPresence)) {
                return;
            }

            const isAITarget = targetId && targetId.startsWith('ai-');
            
            if (collisionResult.type === 'tuskToTusk') {
                if (!isAITarget) {
                    if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                        this.game.room.requestPresenceUpdate(targetId, {
                            type: 'tuskCollision',
                            fromAngle: ai.creature.rotationAngle,
                            knockbackForce: collisionResult.knockbackForce
                        });
                    }
                } else {
                    // AI to AI tusk collision - handle directly
                    const targetAI = this.aiPlayers[targetId];
                    if (targetAI) {
                        // Apply knockback force to the other AI
                        const knockbackAngle = ai.creature.rotationAngle;
                        targetAI.creature.velocity.x += Math.cos(knockbackAngle) * collisionResult.knockbackForce;
                        targetAI.creature.velocity.y += Math.sin(knockbackAngle) * collisionResult.knockbackForce;
                    }
                }
            }
            else if (collisionResult.type === 'lethal') {
                // AI killed another player or AI
                ai.creature.kills++;
                
                if (isAITarget) {
                    // AI to AI lethal hit - handle directly
                    const targetAI = this.aiPlayers[targetId];
                    if (targetAI) {
                        // Store upgrades before processing damage
                        const targetUpgrades = {...targetAI.creature.upgrades};
                        
                        const killed = this.game.aiHealthSystem.processAIDamage(
                            targetAI,
                            'lethal',
                            collisionResult.damage,
                            aiId
                        );
                        
                        if (killed) {
                            // Use new upgrade system to transfer upgrades
                            this.game.aiUpgradeSystem.transferUpgradesFromKill(
                                ai.creature, 
                                targetUpgrades
                            );
                        }
                    }
                } else {
                    // Get upgrades from the human player
                    const targetUpgrades = targetPresence?.upgrades || {};
                    
                    // Request the human player to update their presence
                    if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                        this.game.room.requestPresenceUpdate(targetId, {
                            type: 'collision',
                            killed: true,
                            hitType: 'lethal',
                            damageAmount: collisionResult.damage,
                            segmentIndex: collisionResult.segment,
                            attackerId: aiId
                        });
                    }
                    
                    // Apply any upgrades from the killed player using new upgrade system
                    this.game.aiUpgradeSystem.transferUpgradesFromKill(
                        ai.creature,
                        targetUpgrades
                    );
                }
                
                // Check for new upgrades based on kill count using new upgrade system
                this.game.aiUpgradeSystem.checkAIUpgrades(ai.creature);
                
                // Update AI presence with new kill count and upgrades
                this.aiPresences[aiId] = ai.creature.getPresenceData();
                this.game.playerPresences[aiId] = this.aiPresences[aiId];
            }
            else {
                // Non-lethal hit
                if (isAITarget) {
                    // AI to AI non-lethal hit - handle directly
                    const targetAI = this.aiPlayers[targetId];
                    if (targetAI) {
                        const targetUpgrades = {...targetAI.creature.upgrades};
                        const killed = this.game.aiHealthSystem.processAIDamage(
                            targetAI,
                            collisionResult.type,
                            collisionResult.damage,
                            aiId
                        );
                        if (killed) {
                            ai.creature.kills++;
                            this.game.aiUpgradeSystem.transferUpgradesFromKill(
                                ai.creature,
                                targetUpgrades
                            );
                            this.game.aiUpgradeSystem.checkAIUpgrades(ai.creature);
                            this.aiPresences[aiId] = ai.creature.getPresenceData();
                            this.game.playerPresences[aiId] = this.aiPresences[aiId];
                        }
                    }
                } else {
                    // Non-lethal hit on human player
                    if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                        this.game.room.requestPresenceUpdate(targetId, {
                            type: 'bodyHit',
                            hitType: collisionResult.type,
                            damageAmount: collisionResult.damage,
                            knockbackAngle: ai.creature.rotationAngle,
                            knockbackForce: 5
                        });
                    }
                }
            }
        }
        
        // Also check segment collisions to prevent going through other narwhals
        this.game.narwhalCollisions.checkSegmentCollisions(ai.creature, this.game.playerPresences);
    }

    findNearbyTargets(ai, aiId, range) {
        const targets = [];
        
        // Find players within range
        for (const clientId in this.game.playerPresences) {
            if (clientId === aiId) continue; // Skip self
            
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;
            
            // Calculate distance
            const dx = presence.segments[0].x - ai.creature.segments[0].x;
            const dy = presence.segments[0].y - ai.creature.segments[0].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < range) {
                targets.push({
                    clientId: clientId,
                    distance: distance
                });
            }
        }
        
        return targets;
    }
}