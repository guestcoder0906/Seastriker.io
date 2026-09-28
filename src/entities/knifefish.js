import { CONFIG } from '../core/config.js';
import { Creature } from './creature.js';

export class KnifeFish extends Creature {
    constructor(id, x, y, color, name) {
        super(id, x, y, color, name, 'knifefish');
        
        // KnifeFish-specific properties
        this.speed = CONFIG.BASE_SPEED * CONFIG.KNIFEFISH_SPEED_MULTIPLIER;
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

    update(targetX, targetY, mousePressed, dodgePressed, fastSwimPressed, playerPresences) {
        if (!this.isAlive) return;

        // Update cooldowns
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.dodgeCooldown > 0) this.dodgeCooldown--;

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

        // Burst availability: requires more than 1/2 stamina, costs 1/2 stamina
        const burstMin = CONFIG.BURST_MIN_STAMINA || 0.5;
        const burstCost = CONFIG.BURST_STAMINA_COST || 0.5;
        const canBurst = this.stamina > burstMin;

        // Compute desired angle based on the target
        const dx = targetX - this.segments[0].x;
        const dy = targetY - this.segments[0].y;
        const desiredAngle = Math.atan2(dy, dx);
        
        // Knife fish has more responsive movement and turning
        this.rotationAngle = this.lerpAngle(this.rotationAngle, desiredAngle, 0.15);
        this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, 0.1);

        // Check for dash - knife fish can dash
        const cooldownFrames = CONFIG.RAM_COOLDOWN || CONFIG.DASH_COOLDOWN || 30;
        if (mousePressed && canBurst && !this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
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
            
            // Use the dodge method
            this.dodge();
            
            this.dodgeCooldown = CONFIG.KNIFEFISH_DODGE_COOLDOWN || CONFIG.DODGE_COOLDOWN;
            
            // Longer dodge duration for KnifeFish
            setTimeout(() => {
                this.isDodging = false;
            }, CONFIG.KNIFEFISH_DODGE_DURATION);
        }

        let currentSpeed = this.speed;
        let moveX = 0;
        let moveY = 0;
        
        if (this.isDashing) {
            currentSpeed = this.speed * CONFIG.DASH_MULTIPLIER;
            moveX = Math.cos(this.movementAngle) * currentSpeed;
            moveY = Math.sin(this.movementAngle) * currentSpeed;
        } else if (this.isFastSwimming) {
            currentSpeed = this.speed * (CONFIG.FAST_SWIM_MULTIPLIER || 1.65);
            moveX = Math.cos(this.movementAngle) * currentSpeed;
            moveY = Math.sin(this.movementAngle) * currentSpeed;
        } else if (this.isDodging) {
            // During dodge, movement is already set by the dodge velocity
            // Do not add any additional movement
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
            const phaseStep = this.isFastSwimming ? 0.6 : Math.min(0.38, Math.max(0.14, actualSpeed * 0.04));
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
                    
                    let diffFacing = Math.abs(facingAngle - angleToTarget);
                    while (diffFacing > Math.PI) diffFacing -= 2 * Math.PI;
                    diffFacing = Math.abs(diffFacing);
                    
                    let diffRot = Math.abs(this.rotationAngle - angleToTarget);
                    while (diffRot > Math.PI) diffRot -= 2 * Math.PI;
                    diffRot = Math.abs(diffRot);
                    
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