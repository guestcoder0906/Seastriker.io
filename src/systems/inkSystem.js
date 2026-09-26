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
            if (e.key === 'q' || e.key === 'Q') {
                // Check if player is squid (not octopus) to activate ink
                if (this.game.creature && 
                    this.game.creature.type === 'squid' && 
                    this.game.creature.skinId !== 'octopus' &&
                    this.game.creature.isAlive && 
                    this.game.creature.inkReady) {
                    
                    this.tryActivateInk();
                }
            }
        });
        
        // Mobile ink button is now handled by MobileControlsManager
    }
    
    tryActivateInk() {
        // Only activate if we have a squid as the player creature
        if (this.game.creature && 
            this.game.creature.type === 'squid' && 
            this.game.creature.isAlive && 
            this.game.creature.inkReady) {
            
            this.createInkCloud(this.game.creature);
        }
    }
    
    createInkCloud(squid) {
        // Calculate position behind the squid
        const headSegment = squid.segments[0];
        const inkCloudX = headSegment.x - Math.cos(headSegment.angle) * CONFIG.SEGMENT_SIZE * 3;
        const inkCloudY = headSegment.y - Math.sin(headSegment.angle) * CONFIG.SEGMENT_SIZE * 3;
        
        // Create new ink cloud - fixed position on the map
        const inkCloud = {
            x: inkCloudX,
            y: inkCloudY,
            radius: CONFIG.SQUID_INK_RADIUS,
            createdAt: performance.now(),
            lifespan: CONFIG.SQUID_INK_DURATION,
            creator: squid.id
        };
        
        this.inkClouds.push(inkCloud);
        
        // Set cooldown for squid
        squid.inkReady = false;
        squid.inkCooldown = CONFIG.SQUID_INK_COOLDOWN;
        
        // If this is the local player, update presence
        if (squid.id === this.game.room.clientId) {
            this.game.room.updatePresence({
                inkReady: false,
                inkCooldown: CONFIG.SQUID_INK_COOLDOWN
            });
        }
    }
    
    updateInkClouds() {
        const now = performance.now();
        
        // Remove expired ink clouds
        this.inkClouds = this.inkClouds.filter(cloud => {
            return now - cloud.createdAt < cloud.lifespan;
        });
        
        // Check all players against all ink clouds
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
                        duration: CONFIG.SQUID_INK_EFFECT_DURATION,
                        originalSpeed: presence.speed || CONFIG.BASE_SPEED
                    };
                    
                    // If this is the local player, apply effect locally
                    if (clientId === this.game.room.clientId) {
                        this.applyInkEffect(this.game.creature);
                    } else if (clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
                        // Apply to AI players
                        this.applyInkEffect(this.game.aiController.aiPlayers[clientId].creature);
                    }
                }
            } else {
                // Remove effect if player was affected but is now out of ink
                if (this.affectedPlayers[clientId] && now - this.affectedPlayers[clientId].startTime >= this.affectedPlayers[clientId].duration) {
                    // Remove ink effect
                    if (clientId === this.game.room.clientId) {
                        this.removeInkEffect(this.game.creature);
                    } else if (clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
                        this.removeInkEffect(this.game.aiController.aiPlayers[clientId].creature);
                    }
                    
                    delete this.affectedPlayers[clientId];
                }
            }
        }
    }
    
    isPlayerInAnyInkCloud(clientId, presence) {
        for (const cloud of this.inkClouds) {
            // Skip clouds created by this player
            if (cloud.creator === clientId) continue;
            
            const dx = presence.segments[0].x - cloud.x;
            const dy = presence.segments[0].y - cloud.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < cloud.radius) {
                return true;
            }
        }
        return false;
    }
    
    applyInkEffect(creature) {
        if (!creature) return;
        
        // Store original properties
        creature._originalSpeed = creature.speed;
        creature._originalSightRange = creature.sightRange;
        
        // Apply speed reduction
        creature.speed = creature._originalSpeed * 0.5;
        
        // Apply sight reduction (for AI)
        if (creature.sightRange) {
            creature.sightRange = 0;
        }
        
        // For local player, set inked flag for visual effect
        creature.isInked = true;
    }
    
    removeInkEffect(creature) {
        if (!creature) return;
        
        // Restore original properties
        if (creature._originalSpeed) {
            creature.speed = creature._originalSpeed;
            delete creature._originalSpeed;
        }
        
        if (creature._originalSightRange !== undefined) {
            creature.sightRange = creature._originalSightRange;
            delete creature._originalSightRange;
        }
        
        // Remove inked flag
        creature.isInked = false;
    }
    
    drawInkClouds(ctx) {
        ctx.save();
        
        for (const cloud of this.inkClouds) {
            const now = performance.now();
            const age = now - cloud.createdAt;
            const lifePercent = age / cloud.lifespan;
            
            // Fade out near end of life
            const alpha = lifePercent > 0.7 ? 0.7 - ((lifePercent - 0.7) / 0.3) * 0.7 : 0.7;
            
            // Create radial gradient
            const gradient = ctx.createRadialGradient(
                cloud.x, cloud.y, 0,
                cloud.x, cloud.y, cloud.radius
            );
            
            gradient.addColorStop(0, `rgba(30, 30, 100, ${alpha})`);
            gradient.addColorStop(0.7, `rgba(50, 50, 150, ${alpha * 0.7})`);
            gradient.addColorStop(1, `rgba(70, 70, 180, ${alpha * 0.3})`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    drawInkEffect(ctx) {
        if (!this.game.creature.isInked) return;
        
        // Reset transform to draw in screen space
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw blue/purple translucent overlay - increased opacity from 0.4 to 0.7
        ctx.fillStyle = 'rgba(50, 50, 150, 0.9)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Draw ink splatter patterns - increased opacity from 0.3 to 0.6
        ctx.fillStyle = 'rgba(30, 30, 100, 0.9)';
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * ctx.canvas.width;
            const y = Math.random() * ctx.canvas.height;
            const size = 30 + Math.random() * 100;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}