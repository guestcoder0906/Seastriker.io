import { CONFIG } from '../core/config.js';
import { Creature } from './creature.js';

export class KnifeFish extends Creature {
    constructor(id, x, y, color, name) {
        super(id, x, y, color, name, 'knifefish');
        
        // KnifeFish-specific properties
        this.speed = CONFIG.BASE_SPEED * CONFIG.KNIFEFISH_SPEED_MULTIPLIER;
        this.healthRegenModifier = CONFIG.KNIFEFISH_HEALTH_REGEN_MULTIPLIER || 1.4;
        this.bodyHitbox = [];
        this.headHitbox = { x: 0, y: 0, radius: 0 };
        this.canSeeHidden = true; // Can see camouflaged creatures
        this.canSeeCamouflaged = true;
        this.dashCooldown = 0;
        this.dodgeCooldown = 0;
        this.recentCollisions = {};
        
        // Initialize segments
        this.initializeSegments();
    }

    initializeSegments() {
        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.5;
        // KnifeFish head is the first segment, with elliptical shape
        this.segments.push({
            x: this.x,
            y: this.y,
            targetX: this.x,
            targetY: this.y,
            angle: this.rotationAngle,
            scale: CONFIG.HEAD_SCALE * CONFIG.KNIFEFISH_SIZE_MULTIPLIER,
            isKnifeFishHead: true
        });

        // Add body segments with gradually decreasing size
        for (let i = 1; i < CONFIG.KNIFEFISH_SEGMENTS; i++) {
            const scale = (CONFIG.HEAD_SCALE * CONFIG.KNIFEFISH_SIZE_MULTIPLIER) - 
                         (i / CONFIG.KNIFEFISH_SEGMENTS) * 
                         ((CONFIG.HEAD_SCALE * CONFIG.KNIFEFISH_SIZE_MULTIPLIER) - 
                         (CONFIG.TAIL_SCALE * CONFIG.KNIFEFISH_SIZE_MULTIPLIER));
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

    update(targetX, targetY, mousePressed, dodgePressed, fastSwimPressed, playerPresences, speedFactor = 1.0) {
        if (!this.isAlive) return;

        // Update cooldowns
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.dodgeCooldown > 0) this.dodgeCooldown--;

        // Fast swim handling: allows fast swimming smoothly without stuttering/jittering under half green circle
        const drainRate = CONFIG.FAST_SWIM_DRAIN_RATE || (1 / 180);
        const regenRate = CONFIG.FAST_SWIM_REGEN_RATE || (1 / 250);
        const minSprintStart = CONFIG.FAST_SWIM_MIN_STAMINA || 0.5;

        // Immediately enforce exhaustion if stamina is depleted
        if (this.stamina <= 0) {
            this.stamina = 0;
            this.isFastSwimming = false;
            this.isSprintExhausted = true;
            this.isExhausted = true;
        }

        if (fastSwimPressed && !this.isSprintExhausted && this.stamina > 0.05) {
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
            // Stamina ONLY regenerates when NOT pressing fast swim (catching breath)
            if (!fastSwimPressed) {
                this.stamina = Math.min(1.0, this.stamina + regenRate);
                if (this.isSprintExhausted) {
                    if (this.stamina >= minSprintStart) {
                        this.isSprintExhausted = false;
                        this.isExhausted = false;
                    }
                } else {
                    this.isExhausted = false;
                }
            }
        }

        // Burst availability: requires more than 1/2 stamina, costs 1/2 stamina
        const burstMin = CONFIG.BURST_MIN_STAMINA || 0.5;
        const burstCost = CONFIG.BURST_STAMINA_COST || 0.5;
        const canBurst = this.stamina > burstMin;

        // Distance-based speed calculation:
        // Smaller closeness threshold (10px) to stay still
        // Middle distance (~130px): base speed is original middle speed (1.0x)
        // Further mouse spot (> 130px up to 280px): swims a bit faster (up to ~1.20x)
        const dx = targetX - this.segments[0].x;
        const dy = targetY - this.segments[0].y;
        const dist = Math.hypot(dx, dy);

        const closeThreshold = 10;
        const midDist = 130;
        const farDist = 280;
        const farBonus = 0.20; // a bit faster when mouse is further out

        let distFactor = 0;
        if (dist > closeThreshold) {
            if (dist <= midDist) {
                // Scales smoothly from 0 at closeThreshold up to 1.0 at midDist (middle original speed)
                distFactor = (dist - closeThreshold) / (midDist - closeThreshold);
            } else {
                // Further mouse spot swims a bit faster (up to 1.20x) only when not exhausted
                const farProgress = Math.min(1.0, (dist - midDist) / (farDist - midDist));
                const activeBonus = (this.isExhausted || this.stamina <= 0) ? 0 : farBonus;
                distFactor = 1.0 + farProgress * activeBonus;
            }
        }

        const controlledFactor = (typeof speedFactor === 'number' && Number.isFinite(speedFactor))
            ? Math.max(0, Math.min(1.0, speedFactor))
            : 1.0;
        const effectiveFactor = distFactor * controlledFactor;

        // Compute desired angle based on the target only when target is beyond close threshold or active action is pressed
        if (dist > 12 && (effectiveFactor > 0.02 || mousePressed || dodgePressed || fastSwimPressed)) {
            const desiredAngle = Math.atan2(dy, dx);
            this.rotationAngle = this.lerpAngle(this.rotationAngle, desiredAngle, 0.095);
        }
        
        const angleDiff = Math.abs(Math.atan2(Math.sin(this.rotationAngle - this.movementAngle), Math.cos(this.rotationAngle - this.movementAngle)));
        const moveLerp = angleDiff > Math.PI / 2 ? 0.07 : 0.045;
        this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, moveLerp);

        // Check for dash - knife fish can dash
        const cooldownFrames = CONFIG.RAM_COOLDOWN || CONFIG.DASH_COOLDOWN || 30;
        if (mousePressed && canBurst && !this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isFastSwimming = false;
                this.isSprintExhausted = true;
                this.isExhausted = true;
            }
            this.dashCooldown = cooldownFrames;
            
            // Apply acceleration for knife fish dash
            this.velocity.x = this.velocity.x * 0.5 + Math.cos(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.5;
            this.velocity.y = this.velocity.y * 0.5 + Math.sin(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.5;
            
            setTimeout(() => {
                this.isDashing = false;
            }, CONFIG.DASH_DURATION);
        }

        // Check for dodge - knife fish can dodge backwards with longer duration
        if (dodgePressed && canBurst && !this.isDodging && this.dodgeCooldown <= 0) {
            this.isDodging = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.isFastSwimming = false;
                this.isSprintExhausted = true;
                this.isExhausted = true;
            }
            
            // Use the dodge method
            this.dodge();
            
            this.dodgeCooldown = CONFIG.KNIFEFISH_DODGE_COOLDOWN || CONFIG.DODGE_COOLDOWN;
            
            // Longer dodge duration for KnifeFish
            setTimeout(() => {
                this.isDodging = false;
            }, CONFIG.KNIFEFISH_DODGE_DURATION);
        }

        // Determine current speed:
        // Base swimming scales with distance/motion.
        // Fast swimming (holding shift) swims at sprint speed if not exhausted.
        // When stamina is zero / exhausted, creature cannot swim fast and moves slower.
        let currentSpeed = this.speed * effectiveFactor;
        let moveX = 0;
        let moveY = 0;
        
        if (this.isDashing) {
            currentSpeed = this.speed * CONFIG.DASH_MULTIPLIER;
            moveX = Math.cos(this.movementAngle) * currentSpeed;
            moveY = Math.sin(this.movementAngle) * currentSpeed;
        } else if (this.isFastSwimming && !this.isExhausted && this.stamina > 0) {
            currentSpeed = this.speed * (CONFIG.FAST_SWIM_MULTIPLIER || 1.45);
            moveX = Math.cos(this.movementAngle) * currentSpeed;
            moveY = Math.sin(this.movementAngle) * currentSpeed;
        } else if (this.isDodging) {
            // During dodge, movement is already set by the dodge velocity
            // Do not add any additional movement
        } else if (this.isExhausted || this.stamina <= 0) {
            currentSpeed = this.speed * Math.min(1.0, effectiveFactor) * (CONFIG.EXHAUSTED_SPEED_MULTIPLIER || 0.80);
            moveX = Math.cos(this.movementAngle) * currentSpeed;
            moveY = Math.sin(this.movementAngle) * currentSpeed;
        } else {
            // Normal movement
            moveX = Math.cos(this.movementAngle) * currentSpeed;
            moveY = Math.sin(this.movementAngle) * currentSpeed;
        }
        
        // Only apply normal movement if not dodging
        if (!this.isDodging) {
            // Update velocity with a responsive blend.
            this.velocity.x = this.velocity.x * 0.8 + moveX * 0.2;
            this.velocity.y = this.velocity.y * 0.8 + moveY * 0.2;
            if (Math.hypot(this.velocity.x, this.velocity.y) < 0.03) {
                this.velocity.x = 0;
                this.velocity.y = 0;
            }
            const mag = Math.hypot(this.velocity.x, this.velocity.y);
            const normalMax = (this.isExhausted || this.stamina <= 0)
                ? this.speed * (CONFIG.EXHAUSTED_SPEED_MULTIPLIER || 0.80)
                : this.speed * 1.20;
            const maxAllowed = Math.max(currentSpeed, this.isDashing ? this.speed * CONFIG.DASH_MULTIPLIER : (this.isFastSwimming ? this.speed * (CONFIG.FAST_SWIM_MULTIPLIER || 1.45) : normalMax));
            if (mag > maxAllowed && maxAllowed > 0.01) {
                this.velocity.x = (this.velocity.x / mag) * maxAllowed;
                this.velocity.y = (this.velocity.y / mag) * maxAllowed;
            }
        } else {
            // During dodge, gradually slow down
            this.velocity.x *= 0.98;
            this.velocity.y *= 0.98;
        }
        
        // Update head position
        this.segments[0].targetX = this.segments[0].x + this.velocity.x;
        this.segments[0].targetY = this.segments[0].y + this.velocity.y;
        this.segments[0].x = this.segments[0].targetX;
        this.segments[0].y = this.segments[0].targetY;
        this.segments[0].angle = this.movementAngle;
        
        // Advance swim phase for knifefish undulating tail wave
        const actualSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isMoving = actualSpeed > 0.35 || this.isFastSwimming;
        if (isMoving) {
            const phaseStep = this.isFastSwimming ? 0.32 : Math.min(0.20, Math.max(0.08, actualSpeed * 0.022));
            this.fastSwimPhase = (this.fastSwimPhase || 0) + phaseStep;
        }

        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.4; // Closer segment spacing for knife fish
        // Tail simply rotates back and forth from the point of the start of the tail (no literal waving)
        const tailAngleOffset = isMoving ? Math.sin(this.fastSwimPhase) * (this.isFastSwimming ? 0.35 : 0.22) : 0;
        
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const prevSegment = this.segments[i - 1];
            
            let targetAngle = prevSegment.angle;
            // Tail starts after head and front body; rotates as a unit from that start point
            if (i >= 3) {
                targetAngle = this.segments[2].angle + tailAngleOffset;
            }
            
            segment.angle = this.lerpAngle(segment.angle, targetAngle, 0.4);
            segment.x = prevSegment.x - Math.cos(segment.angle) * segmentSpacing;
            segment.y = prevSegment.y - Math.sin(segment.angle) * segmentSpacing;
        }
        
        // Update hitboxes
        this.updateHitboxes();
        
        // Check for segment collisions
        this.checkSegmentCollisions(playerPresences);
        
        // Handle world boundaries
        this.handleWorldBounds();
    }
    
    updateHitboxes() {
        // KnifeFish's head hitbox
        this.headHitbox = {
            x: this.segments[0].x,
            y: this.segments[0].y,
            radius: CONFIG.SEGMENT_SIZE * 0.6 * 0.8 // Smaller hitbox for knife fish
        };
        
        // Body hitboxes
        this.bodyHitbox = [];
        for (let i = 0; i < this.segments.length; i++) {
            this.bodyHitbox.push({
                x: this.segments[i].x,
                y: this.segments[i].y,
                radius: CONFIG.SEGMENT_SIZE * this.segments[i].scale / 2
            });
        }
    }
    
    // Knife fish collision detection for its attack (blade ram / head strike against all creature segments)
    checkKnifeFishCollisions(playerPresences) {
        if (!this.isAlive || !playerPresences) return null;
        
        const now = performance.now();
        const facingAngle = this.segments[0]?.angle !== undefined ? this.segments[0].angle : this.rotationAngle;
        
        // Blade rostrum point extended forward from the knife fish's head
        const bladeDist = CONFIG.SEGMENT_SIZE * 1.0;
        const bladeX = this.segments[0].x + Math.cos(facingAngle) * bladeDist;
        const bladeY = this.segments[0].y + Math.sin(facingAngle) * bladeDist;
        
        for (const clientId in playerPresences) {
            // Skip self
            if (clientId === this.id) continue;
            
            // Respect collision cooldown
            if (this.recentCollisions && this.recentCollisions[clientId] && (now - this.recentCollisions[clientId] < (CONFIG.COLLISION_COOLDOWN || 1000))) {
                continue;
            }
            
            const otherCreature = playerPresences[clientId];
            
            // Skip if other creature is not alive or doesn't have segments
            if (!otherCreature || !otherCreature.isAlive || !otherCreature.segments || otherCreature.segments.length === 0) continue;
            
            // Knife fish cannot attack creatures hiding inside coral reefs since they are protected
            const isProtectedInCoral = otherCreature.isHiddenInReef || 
                (typeof window !== 'undefined' && window.game?.coralReefSystem?.isCreatureProtectedInReef && window.game.coralReefSystem.isCreatureProtectedInReef(otherCreature));
            if (isProtectedInCoral) continue;
            
            let hitDetected = false;
            let hitSegment = 0;
            let hitType = 'bodyHit';
            
            // Check all segments of the target creature (sharks, narwhals, dolphins, squids, etc.)
            for (let j = 0; j < otherCreature.segments.length; j++) {
                const otherSegment = otherCreature.segments[j];
                const otherSegRadius = (otherSegment.scale || 1.0) * (CONFIG.SEGMENT_SIZE * 0.5);
                
                const headDist = Math.hypot(this.segments[0].x - otherSegment.x, this.segments[0].y - otherSegment.y);
                const bladeDistToSeg = Math.hypot(bladeX - otherSegment.x, bladeY - otherSegment.y);
                
                // Knife fish blade / front reach accounts for both head and target segment size
                const knifeFishReach = CONFIG.SEGMENT_SIZE * 1.1;
                const contactDistance = knifeFishReach + otherSegRadius;
                
                if (headDist < contactDistance || bladeDistToSeg < contactDistance) {
                    // Calculate angle to target segment
                    const angleToTarget = Math.atan2(
                        otherSegment.y - this.segments[0].y,
                        otherSegment.x - this.segments[0].x
                    );
                    
                    const diffFacing = Math.abs(Math.atan2(Math.sin(facingAngle - angleToTarget), Math.cos(facingAngle - angleToTarget)));
                    const diffRot = Math.abs(Math.atan2(Math.sin(this.rotationAngle - angleToTarget), Math.cos(this.rotationAngle - angleToTarget)));
                    
                    const minAngleDiff = Math.min(diffFacing, diffRot);
                    
                    // Attack lands when facing target within frontal cone, or when dashing, or upon blade tip contact
                    if (minAngleDiff < 1.85 || bladeDistToSeg < (otherSegRadius + CONFIG.SEGMENT_SIZE * 0.6) || this.isDashing) {
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
                
                const baseDamage = CONFIG.KNIFEFISH_ATTACK_DAMAGE || 14;
                const damageMultiplier = this.isDashing ? (CONFIG.KNIFEFISH_BOOST_DAMAGE_MULTIPLIER || 2.5) : 1;
                let damage = Math.round(baseDamage * damageMultiplier);
                
                if (this.isDashing) {
                    damage = 50; // Decisive dash attack
                } else if (hitSegment === 0) {
                    damage = Math.round(baseDamage * 1.5);
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
    
    // Alias to ensure any creature call resolves properly
    checkSharkCollisions(playerPresences) {
        return this.checkKnifeFishCollisions(playerPresences);
    }
    
    // Modified dodge behavior to use direction from dodgeHandler
    dodge() {
        if (this.game && this.game.knifeFishDodgeHandler) {
            // Get dodge direction from handler
            const dodgeDirection = this.game.knifeFishDodgeHandler.calculateDodgeDirection(this);
            
            // Apply dodge velocity with direction from handler
            this.velocity.x = this.velocity.x * 0.4 + dodgeDirection.x * CONFIG.KNIFEFISH_DODGE_FORCE * 0.6;
            this.velocity.y = this.velocity.y * 0.4 + dodgeDirection.y * CONFIG.KNIFEFISH_DODGE_FORCE * 0.6;
        } else {
            // Fallback to normal backward dodge if handler not available
            let dodgeDirectionX = -Math.cos(this.rotationAngle);
            let dodgeDirectionY = -Math.sin(this.rotationAngle);
            
            this.velocity.x = this.velocity.x * 0.4 + dodgeDirectionX * CONFIG.KNIFEFISH_DODGE_FORCE * 0.6;
            this.velocity.y = this.velocity.y * 0.4 + dodgeDirectionY * CONFIG.KNIFEFISH_DODGE_FORCE * 0.6;
        }
    }

    checkSelfCollision() {
        // KnifeFish doesn't have self-collision
        return false;
    }

    checkSegmentCollisions(playerPresences) {
        if (!this.isAlive) return false;
        
        for (const clientId in playerPresences) {
            // Skip self
            if (clientId === this.id) continue;
            
            const otherCreature = playerPresences[clientId];
            
            // Skip if other creature is not alive or doesn't have segments
            if (!otherCreature || !otherCreature.isAlive || !otherCreature.segments) continue;
            
            // Check each segment of this knife fish against each segment of the other creature
            for (let i = 0; i < this.segments.length; i++) {
                const segment = this.segments[i];
                
                for (let j = 0; j < otherCreature.segments.length; j++) {
                    const otherSegment = otherCreature.segments[j];
                    
                    // Calculate distance between segments
                    const dx = segment.x - otherSegment.x;
                    const dy = segment.y - otherSegment.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    // If segments are overlapping
                    const minDistance = CONFIG.SEGMENT_SIZE * 0.8; // Allow some overlap
                    
                    if (distance < minDistance) {
                        // Calculate push direction
                        const angle = Math.atan2(dy, dx);
                        const pushForce = (minDistance - distance) * 0.15;
                        
                        // Apply force to own knife fish
                        this.velocity.x += Math.cos(angle) * pushForce;
                        this.velocity.y += Math.sin(angle) * pushForce;
                        
                        return true; // Collision detected
                    }
                }
            }
        }
        
        return false; // No collision detected
    }
}