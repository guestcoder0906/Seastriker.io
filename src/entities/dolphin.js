import { Creature } from './creature.js';
import { CONFIG } from '../core/config.js';

export class Dolphin extends Creature {
    constructor(id, x, y, color, name) {
        super(id, x, y, color, name, 'dolphin');
        
        // Dolphin specific stats: slightly faster than narwhal, turns more easily
        this.speed = CONFIG.BASE_SPEED * (CONFIG.DOLPHIN_SPEED_MULTIPLIER || 1.12);
        this.turnSpeed = CONFIG.DOLPHIN_TURN_FACTOR || 0.16;
        this.sightRange = CONFIG.AI_SIGHT_RANGE * (CONFIG.DOLPHIN_VISION_MULTIPLIER || 1.35);
        
        // Dash and dodge settings
        this.dashCooldown = 0;
        this.dodgeCooldown = 0;
        this.dashTimer = 0;
        this.dodgeTimer = 0;
        
        // Stamina circle (1.0 = green, 0.0 = red)
        this.stamina = 1.0;
        this.isFastSwimming = false;
        this.isExhausted = false;
        this.fastSwimPhase = 0;
        
        // Tail snap attack states
        this.tailSnapState = null; // 'windup' | 'snapping' | 'cooldown'
        this.tailSnapTimer = 0;
        this.tailSnapCooldown = 0;
        this.tailSnapDir = 0;
        this.tailSnapAngleOffset = 0;
        this.currentWaveAmp = 0;
        this.prevRotationAngle = 0;
        this.tailSnapHitTargets = {};
        
        // Collision cooldown tracking
        this.recentCollisions = {};
        
        this.initializeSegments();
    }
    
    initializeSegments() {
        this.segments = [];
        const segmentCount = 12; // Beautifully proportioned dolphin body
        const sizeMult = CONFIG.DOLPHIN_SIZE_MULTIPLIER || 1.15;
        this.segmentSpacing = CONFIG.SEGMENT_SIZE * 0.58 * sizeMult; // Graceful, slightly longer spacing
        
        // Dolphin profile scale - sleeker, thinner head and hydrodynamic body (scaled slightly bigger)
        const scaleProfile = [
            1.18, 1.38, 1.48, 1.46, 1.36, 1.22, 1.05, 0.88, 0.70, 0.52, 0.36, 0.25
        ];
        
        for (let i = 0; i < segmentCount; i++) {
            this.segments.push({
                x: this.x - i * this.segmentSpacing * Math.cos(this.rotationAngle),
                y: this.y - i * this.segmentSpacing * Math.sin(this.rotationAngle),
                targetX: this.x - i * this.segmentSpacing * Math.cos(this.rotationAngle),
                targetY: this.y - i * this.segmentSpacing * Math.sin(this.rotationAngle),
                angle: this.rotationAngle,
                scale: (scaleProfile[i] || 0.3) * sizeMult,
                elasticity: 0.08
            });
        }
    }
    
    update(targetX, targetY, mousePressed, dodgePressed, fastSwimPressed, playerPresences) {
        if (!this.isAlive) return;
        
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.dodgeCooldown > 0) this.dodgeCooldown--;
        if (this.dashTimer > 0) {
            this.dashTimer--;
            if (this.dashTimer <= 0) this.isDashing = false;
        }
        if (this.dodgeTimer > 0) {
            this.dodgeTimer--;
            if (this.dodgeTimer <= 0) this.isDodging = false;
        }
        if (this.tailSnapCooldown > 0) this.tailSnapCooldown--;
        
        // Fast swim handling: allows fast swimming smoothly without stuttering/jittering under half green circle
        const drainRate = CONFIG.FAST_SWIM_DRAIN_RATE || (1 / 120);
        const regenRate = CONFIG.FAST_SWIM_REGEN_RATE || (1 / 120);
        
        if (fastSwimPressed && this.stamina > 0.005 && !this.isSprintExhausted) {
            this.isFastSwimming = true;
            this.stamina = Math.max(0, this.stamina - drainRate);
            if (this.stamina <= 0) {
                this.isFastSwimming = false;
                this.isSprintExhausted = true;
                this.isExhausted = true;
            }
        } else {
            this.isFastSwimming = false;
            this.stamina = Math.min(1.0, this.stamina + regenRate);
            if (this.isSprintExhausted) {
                if (this.stamina >= 0.25 || (!fastSwimPressed && this.stamina >= 0.1)) {
                    this.isSprintExhausted = false;
                    this.isExhausted = false;
                }
            } else if (!fastSwimPressed) {
                this.isExhausted = false;
            }
        }
        
        // Burst availability: stamina must be MORE than 1/2 (> 0.5) to ram
        const burstMin = CONFIG.BURST_MIN_STAMINA || 0.5;
        const burstCost = CONFIG.BURST_STAMINA_COST || 0.5; // uses half stamina
        const canBurst = this.stamina > burstMin;
        
        // Smooth head turning: Dolphin turns more easily than narwhal
        const dx = targetX - this.segments[0].x;
        const dy = targetY - this.segments[0].y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
            const desiredAngle = Math.atan2(dy, dx);
            this.rotationAngle = this.lerpAngle(this.rotationAngle, desiredAngle, this.turnSpeed);
        }
        
        const angleDiff = this.rotationAngle - this.movementAngle;
        if (Math.abs(angleDiff) > Math.PI / 2) {
            this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, 0.08);
        } else {
            this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, 0.05);
        }
        
        // Dash / Burst Attack - reliable ram whenever circle is green
        const cooldownFrames = CONFIG.RAM_COOLDOWN || CONFIG.DASH_COOLDOWN || 30;
        if (mousePressed && canBurst && !this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.dashTimer = 10; // active dash frames
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dashCooldown = cooldownFrames;
            
            this.velocity.x = this.velocity.x * 0.5 + Math.cos(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.5;
            this.velocity.y = this.velocity.y * 0.5 + Math.sin(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.5;
            
            setTimeout(() => {
                this.isDashing = false;
            }, CONFIG.DASH_DURATION);
        }
        
        // Dodge Attack: bursting to front side away from closest creature
        const dodgeCooldownFrames = (typeof CONFIG.DODGE_COOLDOWN === 'number' && CONFIG.DODGE_COOLDOWN < 100) ? CONFIG.DODGE_COOLDOWN : 15;
        if (dodgePressed && canBurst && !this.isDodging && this.dodgeCooldown <= 0) {
            this.isDodging = true;
            this.dodgeTimer = 10;
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dodgeCooldown = dodgeCooldownFrames;
            
            // Find closest creature
            let closestDist = Infinity;
            let closestAngle = null;
            if (playerPresences) {
                for (const cid in playerPresences) {
                    if (cid === this.id) continue;
                    const other = playerPresences[cid];
                    if (!other || !other.isAlive || !other.segments || !other.segments[0]) continue;
                    const dist = Math.hypot(other.segments[0].x - this.segments[0].x, other.segments[0].y - this.segments[0].y);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestAngle = Math.atan2(other.segments[0].y - this.segments[0].y, other.segments[0].x - this.segments[0].x);
                    }
                }
            }
            
            let dodgeAngle = this.rotationAngle + Math.PI / 4; // default front-right
            if (closestAngle !== null) {
                const rel = Math.atan2(Math.sin(closestAngle - this.rotationAngle), Math.cos(closestAngle - this.rotationAngle));
                // If enemy is on our right side, burst front-left; if on left, burst front-right
                dodgeAngle = rel >= 0 ? (this.rotationAngle - Math.PI / 4) : (this.rotationAngle + Math.PI / 4);
            }
            
            const dodgeForce = CONFIG.DODGE_FORCE * 1.1;
            this.velocity.x = this.velocity.x * 0.3 + Math.cos(dodgeAngle) * dodgeForce * 0.7;
            this.velocity.y = this.velocity.y * 0.3 + Math.sin(dodgeAngle) * dodgeForce * 0.7;
            
            setTimeout(() => {
                this.isDodging = false;
            }, CONFIG.DODGE_DURATION);
        }
        
        // Speed calculation
        let currentSpeed = this.speed;
        if (this.isDashing) {
            currentSpeed = this.speed * CONFIG.DASH_MULTIPLIER;
        } else if (this.isFastSwimming) {
            currentSpeed = this.speed * (CONFIG.FAST_SWIM_MULTIPLIER || 1.65);
        }
        
        let moveX = Math.cos(this.movementAngle) * currentSpeed;
        let moveY = Math.sin(this.movementAngle) * currentSpeed;
        
        if (!this.isDodging) {
            this.velocity.x = this.velocity.x * 0.82 + moveX * 0.18;
            this.velocity.y = this.velocity.y * 0.82 + moveY * 0.18;
        } else {
            this.velocity.x *= 0.98;
            this.velocity.y *= 0.98;
        }
        
        // Tail Snap mechanic: sharp deliberate turn during fast swim triggers a wide tail swing
        const turnDelta = Math.atan2(Math.sin(this.rotationAngle - (this.prevRotationAngle || this.rotationAngle)), Math.cos(this.rotationAngle - (this.prevRotationAngle || this.rotationAngle)));
        
        const turnThreshold = CONFIG.DOLPHIN_TURN_SNAP_THRESHOLD || 0.11;
        if (this.isFastSwimming && Math.abs(turnDelta) > turnThreshold && !this.tailSnapState && this.tailSnapCooldown <= 0) {
            // Trigger tail snap on sharp deliberate turn!
            this.tailSnapState = 'windup';
            this.tailSnapTimer = 6;
            this.tailSnapDir = Math.sign(turnDelta);
            this.tailSnapHitTargets = {};
        }
        
        // Progress tail snap state machine smoothly through its phases (does NOT pop or jitter when sprinting stops)
        if (this.tailSnapState === 'windup') {
            this.tailSnapTimer--;
            const targetOffset = -this.tailSnapDir * 0.55;
            this.tailSnapAngleOffset = this.lerp(this.tailSnapAngleOffset, targetOffset, 0.35);
            if (this.tailSnapTimer <= 0) {
                this.tailSnapState = 'snapping';
                this.tailSnapTimer = 16;
            }
        } else if (this.tailSnapState === 'snapping') {
            this.tailSnapTimer--;
            const targetOffset = this.tailSnapDir * 1.65;
            this.tailSnapAngleOffset = this.lerp(this.tailSnapAngleOffset, targetOffset, 0.30);
            if (this.tailSnapTimer <= 0) {
                this.tailSnapState = 'cooldown';
                this.tailSnapTimer = 16;
            }
        } else if (this.tailSnapState === 'cooldown') {
            this.tailSnapTimer--;
            this.tailSnapAngleOffset = this.lerp(this.tailSnapAngleOffset, 0, 0.16);
            if (this.tailSnapTimer <= 0 && Math.abs(this.tailSnapAngleOffset) < 0.04) {
                this.tailSnapState = null;
                this.tailSnapAngleOffset = 0;
                this.tailSnapCooldown = 26; // ~0.9s pause so it happens less often
            }
        } else {
            // Not in tail snap: smoothly decay any residual offset to prevent any jitter when sprint stops
            if (Math.abs(this.tailSnapAngleOffset) > 0.002) {
                this.tailSnapAngleOffset = this.lerp(this.tailSnapAngleOffset, 0, 0.18);
            } else {
                this.tailSnapAngleOffset = 0;
            }
        }
        this.prevRotationAngle = this.rotationAngle;
        
        // Head position
        this.segments[0].targetX = this.segments[0].x + this.velocity.x;
        this.segments[0].targetY = this.segments[0].y + this.velocity.y;
        this.segments[0].x = this.segments[0].targetX;
        this.segments[0].y = this.segments[0].targetY;
        this.segments[0].angle = this.movementAngle;
        
        // Tail wave during swimming (smooth natural wave when swimming, faster during fast swim)
        const actualSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isMoving = actualSpeed > 0.4 || this.isFastSwimming;
        if (isMoving) {
            const phaseStep = this.isFastSwimming ? 0.42 : Math.min(0.26, Math.max(0.09, actualSpeed * 0.026));
            this.fastSwimPhase = (this.fastSwimPhase || 0) + phaseStep;
        }
        
        // Smoothly interpolate swimming wave amplitude (avoids abrupt pops when starting or stopping sprint)
        const targetWaveAmp = isMoving && !this.tailSnapState ? (this.isFastSwimming ? 0.32 : 0.18) : 0;
        this.currentWaveAmp = this.lerp(this.currentWaveAmp || 0, targetWaveAmp, 0.12);

        // Body segment physics
        const sizeMult = CONFIG.DOLPHIN_SIZE_MULTIPLIER || 1.15;
        const segmentSpacing = this.segmentSpacing || (CONFIG.SEGMENT_SIZE * 0.58 * sizeMult);
        const swingStartIdx = Math.floor(this.segments.length * 0.42);
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const prevSegment = this.segments[i - 1];
            
            let targetAngle = prevSegment.angle;
            // 1. Apply tail snap angle offset across rear body segments for a wide, massive arc
            if (i >= swingStartIdx && Math.abs(this.tailSnapAngleOffset) > 0.001) {
                const flukeFactor = Math.pow((i - swingStartIdx + 1) / (this.segments.length - swingStartIdx), 1.25);
                targetAngle += this.tailSnapAngleOffset * flukeFactor;
            }
            
            // 2. Undulating swimming wave smoothly blended in angular space (preserves exact segment spacing, zero jitter)
            if (i > 3 && this.currentWaveAmp > 0.001) {
                const waveFactor = (i - 3) / (this.segments.length - 3);
                const waveAngle = Math.sin(this.fastSwimPhase - i * 0.55) * waveFactor * this.currentWaveAmp;
                targetAngle += waveAngle;
            }
            
            const lerpSpeed = (this.tailSnapState === 'snapping') ? 0.32 : 0.24;
            segment.angle = this.lerpAngle(segment.angle, targetAngle, lerpSpeed);
            segment.x = prevSegment.x - Math.cos(segment.angle) * segmentSpacing;
            segment.y = prevSegment.y - Math.sin(segment.angle) * segmentSpacing;
        }
        
        this.handleWorldBounds();
    }
    
    // Dolphin collision checks: snout ramming attack and tail snap attack
    checkDolphinCollisions(playerPresences) {
        if (!this.isAlive || !playerPresences) return null;
        
        const now = performance.now();
        const snoutDist = CONFIG.SEGMENT_SIZE * 1.48;
        const snoutX = this.segments[0].x + Math.cos(this.rotationAngle) * snoutDist;
        const snoutY = this.segments[0].y + Math.sin(this.rotationAngle) * snoutDist;
        const tailSegment = this.segments[this.segments.length - 1];
        
        for (const clientId in playerPresences) {
            if (clientId === this.id) continue;
            
            if (this.recentCollisions[clientId] && (now - this.recentCollisions[clientId] < (CONFIG.COLLISION_COOLDOWN || 1000))) {
                continue;
            }
            
            const other = playerPresences[clientId];
            if (!other || !other.isAlive || !other.segments) continue;
            
            const isProtectedInCoral = other.isHiddenInReef || 
                (typeof window !== 'undefined' && window.game?.coralReefSystem?.isCreatureProtectedInReef && window.game.coralReefSystem.isCreatureProtectedInReef(other));
            if (isProtectedInCoral) continue;
            
            // 1) Tail Snap attack check (if snapping - wide, sweeping attack)
            if (this.tailSnapState === 'snapping' && !this.tailSnapHitTargets[clientId]) {
                const rearCount = 5;
                const startIdx = Math.max(0, this.segments.length - rearCount);
                for (let k = startIdx; k < this.segments.length; k++) {
                    const myRearSeg = this.segments[k];
                    for (let j = 0; j < other.segments.length; j++) {
                        const otherSeg = other.segments[j];
                        const tailDist = Math.hypot(myRearSeg.x - otherSeg.x, myRearSeg.y - otherSeg.y);
                        if (tailDist < CONFIG.SEGMENT_SIZE * 2.4) {
                            this.recentCollisions[clientId] = now;
                            this.tailSnapHitTargets[clientId] = true;
                            
                            return {
                                clientId: clientId,
                                type: 'tailSnap',
                                damage: CONFIG.DOLPHIN_TAIL_SNAP_DAMAGE || 8,
                                knockbackForce: 2.2,
                                fromAngle: (tailSegment ? tailSegment.angle : this.rotationAngle) + (this.tailSnapDir * Math.PI * 0.4),
                                segment: j
                            };
                        }
                    }
                    if (this.tailSnapHitTargets[clientId]) break;
                }
            }
            
            // 2) Snout ram attack check
            let hitDetected = false;
            let hitSegment = 0;
            
            for (let j = 0; j < other.segments.length; j++) {
                const otherSeg = other.segments[j];
                const otherRadius = (otherSeg.scale || 1.0) * (CONFIG.SEGMENT_SIZE * 0.5);
                const headDist = Math.hypot(this.segments[0].x - otherSeg.x, this.segments[0].y - otherSeg.y);
                const snoutDistToSeg = Math.hypot(snoutX - otherSeg.x, snoutY - otherSeg.y);
                const contactDistance = CONFIG.SEGMENT_SIZE * 1.4 + otherRadius;
                
                if (headDist < contactDistance || snoutDistToSeg < contactDistance) {
                    const angleToTarget = Math.atan2(otherSeg.y - this.segments[0].y, otherSeg.x - this.segments[0].x);
                    const diff = Math.abs(Math.atan2(Math.sin(this.rotationAngle - angleToTarget), Math.cos(this.rotationAngle - angleToTarget)));
                    
                    if (diff < 1.9 || snoutDistToSeg < (CONFIG.SEGMENT_SIZE * 1.0) || this.isDashing) {
                        hitDetected = true;
                        hitSegment = j;
                        break;
                    }
                }
            }
            
            if (hitDetected) {
                this.recentCollisions[clientId] = now;
                const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
                const isHighSpeedRam = this.isDashing || currentSpeed > 13;
                let damage = CONFIG.DOLPHIN_RAM_DAMAGE || 16;
                let hitType = 'bodyHit';
                
                if (isHighSpeedRam) {
                    damage = CONFIG.DOLPHIN_HIGH_SPEED_RAM_DAMAGE || 45;
                    hitType = 'lethal';
                } else if (hitSegment === 0) {
                    damage = CONFIG.DOLPHIN_HEAD_DAMAGE || 20;
                    hitType = 'headHit';
                }
                
                return {
                    clientId: clientId,
                    type: isHighSpeedRam ? 'lethal' : hitType,
                    damage: damage,
                    segment: hitSegment
                };
            }
        }
        
        return null;
    }
    
    getPresenceData() {
        const base = super.getPresenceData();
        return {
            ...base,
            type: 'dolphin',
            stamina: this.stamina,
            isFastSwimming: this.isFastSwimming,
            tailSnapState: this.tailSnapState,
            tailSnapDir: this.tailSnapDir
        };
    }
}
