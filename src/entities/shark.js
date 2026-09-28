import { CONFIG } from '../core/config.js';
import { Creature } from './creature.js';

export class Shark extends Creature {
    constructor(id, x, y, color, name) {
        super(id, x, y, color, name, 'shark');
        
        // Shark-specific properties
        this.speed = CONFIG.BASE_SPEED * CONFIG.SHARK_SPEED_MULTIPLIER;
        this.bodyHitbox = [];
        this.headHitbox = { x: 0, y: 0, radius: 0 };
        this.skinId = null; // To identify the hammerhead shark
        this.sightRange = null; // Already used by AI for detection
        this.attackRangeMultiplier = 1.0; // Default to 1.0 so bite hitbox reaches properly
        this.recentCollisions = {}; // Track recent attacks to avoid single-frame multi-hits
        this.dashCooldown = 0;
        this.dodgeCooldown = 0;
        this.currentWaveAmp = 0;
        this.fastSwimPhase = 0;
        
        // Initialize segments
        this.initializeSegments();
    }

    lerp(a, b, t) {
        return (1 - t) * a + t * b;
    }

    initializeSegments() {
        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.5;
        // Shark head is the first segment, with diamond shape
        this.segments.push({
            x: this.x,
            y: this.y,
            targetX: this.x,
            targetY: this.y,
            angle: this.rotationAngle,
            scale: CONFIG.HEAD_SCALE,
            isSharkHead: true
        });

        // Add body segments with gradually decreasing size
        for (let i = 1; i < CONFIG.SEGMENTS; i++) {
            const scale = CONFIG.HEAD_SCALE - (i / CONFIG.SEGMENTS) * (CONFIG.HEAD_SCALE - CONFIG.TAIL_SCALE * 1.2);
            this.segments.push({
                x: this.x - i * segmentSpacing * Math.cos(this.rotationAngle),
                y: this.y - i * segmentSpacing * Math.sin(this.rotationAngle),
                targetX: this.x - i * segmentSpacing * Math.cos(this.rotationAngle),
                targetY: this.y - i * segmentSpacing * Math.sin(this.rotationAngle),
                angle: this.rotationAngle,
                scale: scale
            });
        }
    }

    update(targetX, targetY, mousePressed, dodgePressed, fastSwimPressed, playerPresences) { 
        if (!this.isAlive) return;

        // Update cooldowns
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.dodgeCooldown > 0) this.dodgeCooldown--;

        // Fast swim handling: allows fast swimming smoothly without stuttering/jittering under half green circle
        const drainRate = CONFIG.FAST_SWIM_DRAIN_RATE || (1 / 180);
        const regenRate = CONFIG.FAST_SWIM_REGEN_RATE || (1 / 180);
        const minSprintStart = CONFIG.FAST_SWIM_MIN_STAMINA || 0.5;

        if (fastSwimPressed && !this.isSprintExhausted && this.stamina > 0.01) {
            this.isFastSwimming = true;
            this.stamina = Math.max(0, this.stamina - drainRate);
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isFastSwimming = false;
                this.isSprintExhausted = true;
                this.isExhausted = true;
            }
        } else {
            this.isFastSwimming = false;
            this.stamina = Math.min(1.0, this.stamina + regenRate);
            if (this.isSprintExhausted) {
                // Must recover stamina buffer before sprinting can re-engage, preventing micro-jitter on empty
                if (this.stamina >= minSprintStart || (!fastSwimPressed && this.stamina >= 0.3)) {
                    this.isSprintExhausted = false;
                    this.isExhausted = false;
                }
            } else if (!fastSwimPressed) {
                this.isExhausted = false;
            }
        }

        // Burst availability: requires more than 1/2 stamina, costs 1/2 stamina
        const burstMin = CONFIG.BURST_MIN_STAMINA || 0.5;
        const burstCost = CONFIG.BURST_STAMINA_COST || 0.5;
        const canBurst = this.stamina > burstMin;

        // Compute desired angle based on the target with deadzone
        const dx = targetX - this.segments[0].x;
        const dy = targetY - this.segments[0].y;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
            const desiredAngle = Math.atan2(dy, dx);
            this.rotationAngle = this.lerpAngle(this.rotationAngle, desiredAngle, 0.085);
        }

        // Update movementAngle
        const angleDiff = Math.abs(Math.atan2(Math.sin(this.rotationAngle - this.movementAngle), Math.cos(this.rotationAngle - this.movementAngle)));
        const turnBlend = angleDiff > Math.PI / 2 ? 0.05 : 0.035;
        this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, turnBlend);

        // Check for dash / burst
        if (mousePressed && canBurst && !this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dashCooldown = CONFIG.RAM_COOLDOWN || CONFIG.DASH_COOLDOWN || 30;
            
            // Apply acceleration for shark dash
            this.velocity.x = this.velocity.x * 0.5 + Math.cos(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.5;
            this.velocity.y = this.velocity.y * 0.5 + Math.sin(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.5;
            
            setTimeout(() => {
                this.isDashing = false;
            }, CONFIG.DASH_DURATION);
        }

        // Determine current speed and movement
        let currentSpeed = this.speed;
        if (this.isDashing) {
            currentSpeed = this.speed * CONFIG.DASH_MULTIPLIER;
        } else if (this.isFastSwimming) {
            currentSpeed = this.speed * (CONFIG.FAST_SWIM_MULTIPLIER || 1.65);
        }
        
        let moveX = Math.cos(this.movementAngle) * currentSpeed;
        let moveY = Math.sin(this.movementAngle) * currentSpeed;
        
        // Apply normal movement
        this.velocity.x = this.velocity.x * 0.85 + moveX * 0.15;
        this.velocity.y = this.velocity.y * 0.85 + moveY * 0.15;
        
        // Clamp velocity
        const mag = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        if (mag > currentSpeed) {
            this.velocity.x = (this.velocity.x / mag) * currentSpeed;
            this.velocity.y = (this.velocity.y / mag) * currentSpeed;
        }
        
        // Update head position
        this.segments[0].targetX = this.segments[0].x + this.velocity.x;
        this.segments[0].targetY = this.segments[0].y + this.velocity.y;
        this.segments[0].x = this.segments[0].targetX;
        this.segments[0].y = this.segments[0].targetY;
        this.segments[0].angle = this.movementAngle;
        
        // Advance swim phase for tail oscillation during swimming
        const actualSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isMoving = actualSpeed > 0.3 || this.isFastSwimming;
        if (isMoving) {
            const phaseStep = this.isFastSwimming ? 0.22 : Math.min(0.15, Math.max(0.05, actualSpeed * 0.015));
            this.fastSwimPhase += phaseStep;
        }

        // Smoothly interpolate swimming wave amplitude (avoids abrupt pops or jerks)
        const targetWaveAmp = isMoving ? (this.isFastSwimming ? 0.28 : 0.14) : 0;
        this.currentWaveAmp = this.lerp(this.currentWaveAmp || 0, targetWaveAmp, 0.09);

        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.5;
        // Update body segment physics with smooth angular swimming wave (zero jitter, preserved spacing)
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const prevSegment = this.segments[i - 1];
            
            let targetAngle = prevSegment.angle;
            if (i > 3 && this.currentWaveAmp > 0.001) {
                const waveFactor = (i - 3) / (this.segments.length - 3);
                const waveAngle = Math.sin(this.fastSwimPhase - i * 0.55) * waveFactor * this.currentWaveAmp;
                targetAngle += waveAngle;
            }

            segment.angle = this.lerpAngle(segment.angle, targetAngle, 0.30);
            segment.x = prevSegment.x - Math.cos(segment.angle) * segmentSpacing;
            segment.y = prevSegment.y - Math.sin(segment.angle) * segmentSpacing;
        }
        
        // Check segment push collisions with other creatures
        this.checkSegmentCollisions(playerPresences);
        
        // Update hitboxes
        this.updateHitboxes();
        
        // Handle world boundaries
        this.handleWorldBounds();
    }
    
    updateHitboxes() {
        // Shark's head hitbox
        this.headHitbox = {
            x: this.segments[0].x,
            y: this.segments[0].y,
            radius: CONFIG.SEGMENT_SIZE * 0.8
        };
        
        // Body hitboxes
        this.bodyHitbox = [];
        for (let i = 0; i < this.segments.length; i++) {
            this.bodyHitbox.push({
                x: this.segments[i].x,
                y: this.segments[i].y,
                radius: CONFIG.SEGMENT_SIZE / 2
            });
        }
    }

    // Physical segment pushing between creatures
    checkSegmentCollisions(playerPresences) {
        if (!this.isAlive || !playerPresences) return;

        for (const clientId in playerPresences) {
            const otherCreature = playerPresences[clientId];
            if (clientId === this.id || (typeof window !== 'undefined' && window.game?.isSelf && window.game.isSelf(clientId, otherCreature))) continue;
            if (!otherCreature || !otherCreature.isAlive || !otherCreature.segments) continue;

            // Push other segments of shark away if overlapping
            for (let i = 1; i < this.segments.length; i++) {
                const segment = this.segments[i];

                for (let j = 0; j < otherCreature.segments.length; j++) {
                    const otherSegment = otherCreature.segments[j];
                    const dx = segment.x - otherSegment.x;
                    const dy = segment.y - otherSegment.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const minDistance = CONFIG.SEGMENT_SIZE * 0.8;

                    if (distance < minDistance && distance > 0) {
                        const angle = Math.atan2(dy, dx);
                        const pushForce = (minDistance - distance) * 0.15;
                        this.velocity.x += Math.cos(angle) * pushForce;
                        this.velocity.y += Math.sin(angle) * pushForce;
                    }
                }
            }
        }
    }
    
    // Special collision checking for shark's ram and bite attack
    checkSharkCollisions(playerPresences) {
        if (!this.isAlive || !playerPresences) return null;
        
        const now = performance.now();
        const rangeMultiplier = this.attackRangeMultiplier || 1.0;
        const facingAngle = this.segments[0]?.angle !== undefined ? this.segments[0].angle : this.rotationAngle;
        
        // Snout point extended forward from the shark's head
        const snoutDist = (CONFIG.SEGMENT_SIZE * 1.0) * rangeMultiplier;
        const snoutX = this.segments[0].x + Math.cos(facingAngle) * snoutDist;
        const snoutY = this.segments[0].y + Math.sin(facingAngle) * snoutDist;
        
        for (const clientId in playerPresences) {
            const otherCreature = playerPresences[clientId];
            // Skip self
            if (clientId === this.id || (typeof window !== 'undefined' && window.game?.isSelf && window.game.isSelf(clientId, otherCreature))) continue;
            
            // Check for cooldown on this specific collision pair (1 second)
            if (this.recentCollisions && this.recentCollisions[clientId] && (now - this.recentCollisions[clientId] < (CONFIG.COLLISION_COOLDOWN || 1000))) {
                continue;
            }
            
            // Skip if other creature is not alive or doesn't have segments
            if (!otherCreature || !otherCreature.isAlive || !otherCreature.segments) continue;
            
            // Sharks cannot attack creatures hiding inside coral reefs since they are protected
            const isProtectedInCoral = otherCreature.isHiddenInReef || 
                (typeof window !== 'undefined' && window.game?.coralReefSystem?.isCreatureProtectedInReef && window.game.coralReefSystem.isCreatureProtectedInReef(otherCreature));
            if (isProtectedInCoral) continue;
            
            let hitDetected = false;
            let hitType = 'bodyHit';
            let hitSegment = 0;
            
            // Check all segments of the target creature against shark's mouth / head
            for (let j = 0; j < otherCreature.segments.length; j++) {
                const otherSegment = otherCreature.segments[j];
                const otherSegRadius = (otherSegment.scale || 1.0) * (CONFIG.SEGMENT_SIZE * 0.5);
                
                const headDist = Math.hypot(this.segments[0].x - otherSegment.x, this.segments[0].y - otherSegment.y);
                const snoutDistToSeg = Math.hypot(snoutX - otherSegment.x, snoutY - otherSegment.y);
                
                const sharkHeadRadius = CONFIG.SEGMENT_SIZE * 1.4 * rangeMultiplier;
                const contactDistance = sharkHeadRadius + otherSegRadius;
                
                if (headDist < contactDistance || snoutDistToSeg < contactDistance) {
                    // Calculate angle to target
                    const angleToTarget = Math.atan2(
                        otherSegment.y - this.segments[0].y,
                        otherSegment.x - this.segments[0].x
                    );
                    
                    const diffFacing = Math.abs(Math.atan2(Math.sin(facingAngle - angleToTarget), Math.cos(facingAngle - angleToTarget)));
                    const diffRot = Math.abs(Math.atan2(Math.sin(this.rotationAngle - angleToTarget), Math.cos(this.rotationAngle - angleToTarget)));
                    
                    const minAngleDiff = Math.min(diffFacing, diffRot);
                    
                    // Shark attacks whenever head/mouth touches target and facing target, OR when dashing, OR on direct snout contact
                    if (minAngleDiff < 2.0 || snoutDistToSeg < (CONFIG.SEGMENT_SIZE * 0.9 * rangeMultiplier) || this.isDashing) {
                        hitDetected = true;
                        hitSegment = j;
                        if (this.isDashing) {
                            hitType = 'lethal';
                        } else if (j === 0) {
                            hitType = 'headHit';
                        } else {
                            hitType = 'bodyHit';
                        }
                        break;
                    }
                }
            }
            
            if (hitDetected) {
                if (!this.recentCollisions) this.recentCollisions = {};
                this.recentCollisions[clientId] = now;
                
                let damage = CONFIG.SHARK_RAM_DAMAGE || 28;
                
                if (this.isDashing) {
                    damage = CONFIG.SHARK_DASH_DAMAGE || 70;
                } else if (hitSegment === 0) {
                    // Direct shark head-on bite attack deals extra damage
                    damage = CONFIG.SHARK_HEAD_DAMAGE || 36;
                }
                
                if (this.damageMultiplier) {
                    damage = Math.round(damage * this.damageMultiplier);
                }
                
                return {
                    clientId: clientId,
                    type: this.isDashing ? 'lethal' : hitType,
                    damage: damage,
                    segment: hitSegment
                };
            }
        }
        
        return null;
    }
    
    checkSelfCollision() {
        // Sharks don't have tusk self-collision
        return false;
    }
}