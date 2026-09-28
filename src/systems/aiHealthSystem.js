import { CONFIG } from '../core/config.js';
import { CreatureFactory } from '../entities/creatureFactory.js';

export class AIHealthSystem {
    constructor(game) {
        this.game = game;
    }

    // Process damage for AI players and handle their health
    processAIDamage(aiPlayer, damageType, damageAmount, attackerClientId, alreadyEvadeChecked = false) {
        if (!aiPlayer || !aiPlayer.creature || !aiPlayer.creature.isAlive) return false;

        let narwhal = aiPlayer.creature;

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
            narwhal.isAlive = false;
            narwhal.kills = 0;

            // Clear any tentacle slow effect
            if (narwhal._tentacleSlowed) {
                delete narwhal._tentacleSlowed;
                delete narwhal._originalTentacleSpeed;
            }

            const aiId = narwhal.id;

            // Handle attacker kill count increment if attacker is an AI or remote player
            if (attackerClientId) {
                if (attackerClientId.startsWith('ai-')) {
                    const attackerAI = this.game.aiController.aiPlayers[attackerClientId];
                    if (attackerAI && attackerAI.creature) {
                        attackerAI.creature.kills = (attackerAI.creature.kills || 0) + 1;
                        this.game.aiController.aiPresences[attackerClientId] = attackerAI.creature.getPresenceData();
                        this.game.playerPresences[attackerClientId] = this.game.aiController.aiPresences[attackerClientId];
                    }
                } else if (attackerClientId !== this.game.room?.clientId && attackerClientId !== this.game.creature?.id) {
                    if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                        this.game.room.requestPresenceUpdate(attackerClientId, {
                            type: 'incrementKills',
                            amount: 1,
                            victimId: narwhal.id,
                            victimName: narwhal.name || "AI Predator"
                        });
                    }
                }
            }

            // Clean up the dead AI player from all collections so it cannot linger frozen
            if (this.game.aiController) {
                this.game.aiController.removeAIPlayer(aiId);
            }

            return true;
        } else {
            // AI didn't die, update presence health only
            const aiId = narwhal.id;
            if (this.game.aiController.aiPresences[aiId]) {
                this.game.aiController.aiPresences[aiId].health = narwhal.health;
                this.game.playerPresences[aiId] = this.game.aiController.aiPresences[aiId];
            }

            return false;
        }
    }

    // Corrected AI health regeneration method
    updateAIHealth() {
        for (const aiId in this.game.aiController.aiPlayers) {
            const aiPlayer = this.game.aiController.aiPlayers[aiId];

            if (aiPlayer && aiPlayer.creature && aiPlayer.creature.isAlive) {
                const narwhal = aiPlayer.creature;

                if (narwhal.health < CONFIG.MAX_HEALTH) {
                    const isKnifeFish = narwhal.type === 'knifefish';
                    const baseRegen = CONFIG.HEALTH_REGEN_RATE || 0.14;
                    const modifier = (typeof narwhal.healthRegenModifier === 'number' && narwhal.healthRegenModifier > 0)
                        ? narwhal.healthRegenModifier
                        : (isKnifeFish ? (CONFIG.KNIFEFISH_HEALTH_REGEN_MULTIPLIER || 1.4) : 1.0);
                    const regenAmount = baseRegen * modifier;

                    narwhal.health = Math.min(
                        CONFIG.MAX_HEALTH,
                        narwhal.health + regenAmount
                    );

                    // Properly update AI presence with regenerated health
                    if (this.game.aiController.aiPresences[aiId]) {
                        this.game.aiController.aiPresences[aiId].health = narwhal.health;
                        this.game.playerPresences[aiId] = this.game.aiController.aiPresences[aiId];
                    }
                }
            }
        }
    }
}