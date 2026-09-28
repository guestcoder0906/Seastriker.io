import { CONFIG } from '../core/config.js';

export class InkSystem {
    constructor(game) {
        this.game = game;
        this.inkClouds = [];
        this.affectedPlayers = {};
        this.setupInkControls();
    }
    
    setupInkControls() {
        // Keyboard Q key handler
        window.addEventListener('keydown', (e) => {
            if (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ') {
                this.tryActivateInk();
            }
        });
    }
    
    tryActivateInk() {
        // Only activate if we have an active squid (and not octopus)
        if (!this.game.creature || !this.game.creature.isAlive) return false;
        
        if (this.game.creature.type !== 'squid') return false;
        if (this.game.creature.skinId === 'octopus') return false;
        if (!this.game.creature.inkReady) return false;
        if (this.game.creature.inkCooldown > 0) return false;
        
        this.createInkCloud(this.game.creature);
        return true;
    }
    
    createInkCloud(squid) {
        if (!squid || !squid.segments || squid.segments.length === 0) return;

        // Position ink cloud at the squid's body/siphon behind the head
        let inkCloudX = squid.segments[0].x;
        let inkCloudY = squid.segments[0].y;
        
        if (squid.segments.length > 2) {
            const bodySeg = squid.segments[Math.floor(squid.segments.length * 0.6)];
            inkCloudX = bodySeg.x;
            inkCloudY = bodySeg.y;
        } else {
            const angle = squid.segments[0].angle !== undefined ? squid.segments[0].angle : (squid.rotationAngle || 0);
            inkCloudX -= Math.cos(angle) * CONFIG.SEGMENT_SIZE * 2;
            inkCloudY -= Math.sin(angle) * CONFIG.SEGMENT_SIZE * 2;
        }
        
        // Create new ink cloud - fixed position on the map
        const inkCloud = {
            id: 'ink_' + Math.random().toString(36).substring(2, 9),
            x: inkCloudX,
            y: inkCloudY,
            radius: CONFIG.SQUID_INK_RADIUS || 120,
            createdAt: performance.now(),
            lifespan: CONFIG.SQUID_INK_DURATION || 5000,
            creator: squid.id
        };
        
        this.inkClouds.push(inkCloud);
        
        // Set cooldown for squid
        squid.inkReady = false;
        const cooldown = (CONFIG.SQUID_INK_COOLDOWN || 7000) / (squid.inkCooldownModifier || 1.0);
        squid.inkCooldown = cooldown;
        squid._inkFiredTime = performance.now();
        
        // If this is the local player, update presence and mobile controls
        if (squid.id === this.game.room.clientId) {
            if (this.game.mobileControlsManager) {
                this.game.mobileControlsManager.updateControlsVisibility();
            }
            if (typeof squid.getPresenceData === 'function') {
                this.game.room.updatePresence(squid.getPresenceData());
            } else {
                this.game.room.updatePresence({
                    inkReady: false,
                    inkCooldown: cooldown
                });
            }
            
            // Broadcast ink cloud to other players
            if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                for (const peerId in this.game.room.peers) {
                    if (peerId !== this.game.room.clientId) {
                        this.game.room.requestPresenceUpdate(peerId, {
                            type: 'spawnInkCloud',
                            cloud: {
                                x: inkCloud.x,
                                y: inkCloud.y,
                                radius: inkCloud.radius,
                                lifespan: inkCloud.lifespan,
                                creator: inkCloud.creator
                            }
                        });
                    }
                }
            }
        }
    }
    
    addRemoteInkCloud(cloudData) {
        if (!cloudData) return;
        this.inkClouds.push({
            id: 'remote_ink_' + Math.random().toString(36).substring(2, 9),
            x: cloudData.x,
            y: cloudData.y,
            radius: cloudData.radius || CONFIG.SQUID_INK_RADIUS || 120,
            createdAt: performance.now(),
            lifespan: cloudData.lifespan || CONFIG.SQUID_INK_DURATION || 5000,
            creator: cloudData.creator
        });
    }
    
    updateInkClouds() {
        const now = performance.now();
        
        // Remove expired ink clouds
        this.inkClouds = this.inkClouds.filter(cloud => {
            return now - cloud.createdAt < cloud.lifespan;
        });
        
        // Check all external players & AI against ink clouds
        for (const clientId in this.game.playerPresences) {
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;
            
            // Skip checking ink clouds created by this player
            const affected = this.isPlayerInAnyInkCloud(clientId, presence);
            
            if (affected) {
                // Apply ink effect if not already affected
                if (!this.affectedPlayers[clientId]) {
                    this.affectedPlayers[clientId] = {
                        startTime: now,
                        duration: CONFIG.SQUID_INK_EFFECT_DURATION || 4000
                    };
                    
                    if (clientId === this.game.room.clientId && this.game.creature) {
                        this.applyInkEffect(this.game.creature, clientId);
                    } else if (clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
                        this.applyInkEffect(this.game.aiController.aiPlayers[clientId].creature, clientId);
                    } else {
                        // Human peer - notify via presence update request
                        if (this.game.room && typeof this.game.room.requestPresenceUpdate === 'function') {
                            this.game.room.requestPresenceUpdate(clientId, {
                                type: 'inkEffect',
                                isInked: true,
                                duration: CONFIG.SQUID_INK_EFFECT_DURATION || 4000
                            });
                        }
                    }
                }
            } else {
                // Remove effect if player was affected but duration has expired
                if (this.affectedPlayers[clientId] && now - this.affectedPlayers[clientId].startTime >= this.affectedPlayers[clientId].duration) {
                    if (clientId === this.game.room.clientId && this.game.creature) {
                        this.removeInkEffect(this.game.creature, clientId);
                    } else if (clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
                        this.removeInkEffect(this.game.aiController.aiPlayers[clientId].creature, clientId);
                    }
                    delete this.affectedPlayers[clientId];
                }
            }
        }
        
        // Also check local player against ink clouds created by others
        if (this.game.creature && this.game.creature.isAlive && this.game.creature.segments && this.game.creature.segments[0]) {
            const localId = this.game.room.clientId;
            const affected = this.isPlayerInAnyInkCloud(localId, this.game.creature);
            
            if (affected) {
                if (!this.affectedPlayers[localId]) {
                    this.affectedPlayers[localId] = {
                        startTime: now,
                        duration: CONFIG.SQUID_INK_EFFECT_DURATION || 4000
                    };
                    this.applyInkEffect(this.game.creature, localId);
                }
            } else if (this.affectedPlayers[localId] && now - this.affectedPlayers[localId].startTime >= this.affectedPlayers[localId].duration) {
                this.removeInkEffect(this.game.creature, localId);
                delete this.affectedPlayers[localId];
            }
        }
    }
    
    isPlayerInAnyInkCloud(clientId, creatureOrPresence) {
        if (!creatureOrPresence || !creatureOrPresence.segments || !creatureOrPresence.segments[0]) return false;
        
        const head = creatureOrPresence.segments[0];
        
        for (const cloud of this.inkClouds) {
            // Skip clouds created by this player
            if (cloud.creator === clientId) continue;
            
            const dx = head.x - cloud.x;
            const dy = head.y - cloud.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < cloud.radius) {
                return true;
            }
        }
        return false;
    }
    
    applyInkEffect(creature, clientId) {
        if (!creature) return;
        
        creature.isInked = true;
        
        // If it's an AI player, blind them by eliminating sight range and dropping active target
        if (clientId && clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
            const ai = this.game.aiController.aiPlayers[clientId];
            ai.sightRange = 0;
            ai.target = null;
            ai.state = 'exploring';
        }
    }
    
    removeInkEffect(creature, clientId) {
        if (!creature) return;
        
        creature.isInked = false;
        
        // Restore AI sight
        if (clientId && clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
            const ai = this.game.aiController.aiPlayers[clientId];
            ai.sightRange = CONFIG.AI_SIGHT_RANGE || 400;
        }
    }
    
    drawInkClouds(ctx) {
        if (!this.inkClouds || this.inkClouds.length === 0) return;
        
        ctx.save();
        const now = performance.now();
        
        for (const cloud of this.inkClouds) {
            const age = now - cloud.createdAt;
            const lifePercent = Math.max(0, Math.min(1.0, age / cloud.lifespan));
            
            // Fade out smoothly in the last 30% of lifespan
            let alpha = 0.88;
            if (lifePercent > 0.7) {
                alpha = 0.88 * (1.0 - (lifePercent - 0.7) / 0.3);
            }
            alpha = Math.max(0, Math.min(1.0, alpha));
            if (alpha <= 0.01) continue;
            
            // Expansion over time
            const currentRadius = cloud.radius * (0.8 + 0.35 * Math.sin(lifePercent * Math.PI * 0.5));
            
            // Draw billowing puffs for rich volumetric ink appearance
            const puffCount = 6;
            for (let p = 0; p < puffCount; p++) {
                const angle = (p / puffCount) * Math.PI * 2 + (cloud.createdAt % 10);
                const puffDist = currentRadius * 0.38;
                const px = cloud.x + Math.cos(angle) * puffDist;
                const py = cloud.y + Math.sin(angle) * puffDist;
                const puffRadius = currentRadius * 0.55;
                
                const puffGrad = ctx.createRadialGradient(px, py, 0, px, py, puffRadius);
                puffGrad.addColorStop(0, `rgba(10, 5, 25, ${alpha * 0.85})`);
                puffGrad.addColorStop(0.7, `rgba(20, 15, 45, ${alpha * 0.5})`);
                puffGrad.addColorStop(1, `rgba(30, 20, 60, 0)`);
                
                ctx.fillStyle = puffGrad;
                ctx.beginPath();
                ctx.arc(px, py, puffRadius, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Main dense ink core gradient
            const gradient = ctx.createRadialGradient(
                cloud.x, cloud.y, 0,
                cloud.x, cloud.y, currentRadius
            );
            
            gradient.addColorStop(0, `rgba(5, 5, 18, ${alpha})`);
            gradient.addColorStop(0.45, `rgba(16, 12, 40, ${alpha * 0.9})`);
            gradient.addColorStop(0.8, `rgba(30, 25, 75, ${alpha * 0.55})`);
            gradient.addColorStop(1, `rgba(45, 35, 95, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(cloud.x, cloud.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    drawInkEffect(ctx) {
        if (!this.game.creature || !this.game.creature.isInked) return;
        
        // Reset transform to draw in screen space
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw deep midnight ink overlay blinding the view
        ctx.fillStyle = 'rgba(8, 10, 30, 0.82)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Draw dark ink splatter vignettes around edges
        ctx.fillStyle = 'rgba(4, 5, 18, 0.92)';
        const splatCount = 12;
        for (let i = 0; i < splatCount; i++) {
            // Semi-static splatter based on index
            const sx = (ctx.canvas.width * (0.05 + 0.9 * ((i * 37) % 100) / 100));
            const sy = (ctx.canvas.height * (0.05 + 0.9 * ((i * 59) % 100) / 100));
            const size = 35 + ((i * 23) % 60);
            
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}
