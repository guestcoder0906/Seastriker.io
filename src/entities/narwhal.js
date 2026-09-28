import { CONFIG } from '../core/config.js';
import { Creature } from './creature.js';

export class Narwhal extends Creature {
    constructor(id, x, y, color, name) {
        super(id, x, y, color, name, 'narwhal');  // Pass 'narwhal' as the type
        
        // Narwhal-specific properties
        this.tuskHitbox = { x: 0, y: 0, width: 0, height: 0 };
        this.bodyHitbox = [];
        this.dashCooldown = 0;
        this.dodgeCooldown = 0;
        
        // Initialize segments
        this.initializeSegments();
    }

    initializeSegments() {
        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.5;
        const total = CONFIG.SEGMENTS || 15;
        const baseMultiplier = CONFIG.NARWHAL_SIZE_MULTIPLIER || 0.9;

        // Head is slightly smaller (1.75), midsection torso swells smoothly (2.38), then tapers to tail
        const getSegmentScale = (i) => {
            const t = i / (total - 1);
            if (t <= 0.28) {
                // Smooth transition from slightly smaller head up to midsection torso
                const u = t / 0.28;
                return (1.75 + (2.38 - 1.75) * Math.sin(u * Math.PI * 0.5)) * baseMultiplier;
            } else {
                // Smooth taper from midsection down to tail
                const u = (t - 0.28) / (1 - 0.28);
                return (2.38 - (2.38 - 0.50) * Math.pow(u, 0.88)) * baseMultiplier;
            }
        };

        // Head is the first segment. "round: true" indicates a round head.
        this.segments.push({
            x: this.x,
            y: this.y,
            targetX: this.x,
            targetY: this.y,
            angle: this.rotationAngle,
            scale: getSegmentScale(0),
            round: true
        });

        // Add body segments with thicker midsection torso and gradual tapering.
        for (let i = 1; i < total; i++) {
            this.segments.push({
                x: this.x - i * segmentSpacing * Math.cos(this.rotationAngle),
                y: this.y - i * segmentSpacing * Math.sin(this.rotationAngle),
                targetX: this.x - i * segmentSpacing * Math.cos(this.rotationAngle),
                targetY: this.y - i * segmentSpacing * Math.sin(this.rotationAngle),
                angle: this.rotationAngle,
                scale: getSegmentScale(i)
            });
        }
    }

    update(targetX, targetY, mousePressed, dodgePressed, fastSwimPressed, playerPresences) {
        if (!this.isAlive) return;

        // Update cooldowns.
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

        // Compute desired angle based on the target with a slight deadzone to prevent jitter
        const dx = targetX - this.segments[0].x;
        const dy = targetY - this.segments[0].y;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
            const desiredAngle = Math.atan2(dy, dx);
            this.rotationAngle = this.lerpAngle(this.rotationAngle, desiredAngle, 0.08);
        }

        // Update movementAngle with natural hydrodynamic turning
        const angleDiff = Math.abs(Math.atan2(Math.sin(this.rotationAngle - this.movementAngle), Math.cos(this.rotationAngle - this.movementAngle)));
        const turnBlend = angleDiff > Math.PI / 2 ? 0.05 : 0.035;
        this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, turnBlend);

        // Check for dash / burst
        if (mousePressed && canBurst && !this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dashCooldown = CONFIG.RAM_COOLDOWN || CONFIG.DASH_COOLDOWN || 30;
            
            // Apply a smooth acceleration rather than instant speed change
            this.velocity.x = this.velocity.x * 0.7 + Math.cos(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.3;
            this.velocity.y = this.velocity.y * 0.7 + Math.sin(this.movementAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.3;
            
            setTimeout(() => {
                this.isDashing = false;
            }, CONFIG.DASH_DURATION);
        }

        // Check for dodge.
        if (dodgePressed && canBurst && !this.isDodging && this.dodgeCooldown <= 0) {
            this.isDodging = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dodgeCooldown = CONFIG.DODGE_COOLDOWN;
            
            // Dodge is backward from current facing direction
            let dodgeDirectionX = -Math.cos(this.rotationAngle);
            let dodgeDirectionY = -Math.sin(this.rotationAngle);
            
            this.velocity.x = this.velocity.x * 0.4 + dodgeDirectionX * CONFIG.DODGE_FORCE * 0.6;
            this.velocity.y = this.velocity.y * 0.4 + dodgeDirectionY * CONFIG.DODGE_FORCE * 0.6;
            
            setTimeout(() => {
                this.isDodging = false;
            }, CONFIG.DODGE_DURATION);
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
        
        // Only apply normal movement if not dodging
        if (!this.isDodging) {
            this.velocity.x = this.velocity.x * 0.85 + moveX * 0.15;
            this.velocity.y = this.velocity.y * 0.85 + moveY * 0.15;
        } else {
            this.velocity.x *= 0.98;
            this.velocity.y *= 0.98;
        }
        
        // Clamp velocity so the magnitude does not exceed currentSpeed
        if (!this.isDodging) {
            const mag = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
            if (mag > currentSpeed) {
                this.velocity.x = (this.velocity.x / mag) * currentSpeed;
                this.velocity.y = (this.velocity.y / mag) * currentSpeed;
            }
        }
        
        // Update head position.
        this.segments[0].targetX = this.segments[0].x + this.velocity.x;
        this.segments[0].targetY = this.segments[0].y + this.velocity.y;
        this.segments[0].x = this.segments[0].targetX;
        this.segments[0].y = this.segments[0].targetY;
        this.segments[0].angle = this.movementAngle;
        
        // Advance swim phase for tail oscillation during swimming
        const actualSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isMoving = actualSpeed > 0.4 || this.isFastSwimming;
        if (isMoving) {
            const phaseStep = this.isFastSwimming ? 0.28 : Math.min(0.18, Math.max(0.06, actualSpeed * 0.018));
            this.fastSwimPhase += phaseStep;
        }
        
        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.5;
        // Update body segment physics with tail oscillation
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const prevSegment = this.segments[i - 1];
            segment.angle = this.lerpAngle(segment.angle, prevSegment.angle, 0.3);
            segment.x = prevSegment.x - Math.cos(segment.angle) * segmentSpacing;
            segment.y = prevSegment.y - Math.sin(segment.angle) * segmentSpacing;
            
            // Tail fin waves back and forth while swimming
            if (isMoving && i > 4) {
                const waveFactor = (i - 4) / (this.segments.length - 4);
                const waveAmp = this.isFastSwimming ? 4.5 : Math.min(3.2, 1.0 + actualSpeed * 0.22);
                const waveOffset = Math.sin(this.fastSwimPhase - i * 0.6) * waveFactor * waveAmp;
                const perp = segment.angle + Math.PI / 2;
                segment.x += Math.cos(perp) * waveOffset;
                segment.y += Math.sin(perp) * waveOffset;
            }
        }
        
        // Check self-collision.
        this.checkSelfCollision();
        // Check for collision with other narwhals
        this.checkNarwhalCollisions(playerPresences);
        // Update hitboxes.
        this.updateHitboxes();
        // Handle world boundaries.
        this.handleWorldBounds();
    }
    
    updateHitboxes() {
        // Use tuskLengthModifier for tusk length, originating from apex of oval head dome
        const tuskLength = CONFIG.TUSK_LENGTH * this.tuskLengthModifier;
        const head = this.segments[0];
        const headRadius = (CONFIG.SEGMENT_SIZE * head.scale) / 2;
        const headDomeLen = headRadius * 1.3;
        const apexX = head.x + Math.cos(this.rotationAngle) * headDomeLen;
        const apexY = head.y + Math.sin(this.rotationAngle) * headDomeLen;
        const tuskEndX = apexX + Math.cos(this.rotationAngle) * tuskLength;
        const tuskEndY = apexY + Math.sin(this.rotationAngle) * tuskLength;
        this.tuskHitbox = {
            x1: apexX,
            y1: apexY,
            x2: tuskEndX,
            y2: tuskEndY
        };
        this.bodyHitbox = [];
        for (let i = 0; i < this.segments.length; i++) {
            this.bodyHitbox.push({
                x: this.segments[i].x,
                y: this.segments[i].y,
                radius: (CONFIG.SEGMENT_SIZE * this.segments[i].scale) / 2
            });
        }
    }
    
    checkSelfCollision() {
        for (let i = 2; i < this.bodyHitbox.length; i++) {
            const bodyPart = this.bodyHitbox[i];
            const hit = this.lineCircleIntersect(
                this.tuskHitbox.x1, this.tuskHitbox.y1,
                this.tuskHitbox.x2, this.tuskHitbox.y2,
                bodyPart.x, bodyPart.y, bodyPart.radius
            );
            if (hit) {
                const knockbackAngle = Math.atan2(
                    bodyPart.y - this.segments[0].y,
                    bodyPart.x - this.segments[0].x
                );
                this.velocity.x += Math.cos(knockbackAngle) * 2;
                this.velocity.y += Math.sin(knockbackAngle) * 2;
                break;
            }
        }
    }

    checkTuskCollision(otherNarwhal) {
        if (!this.isAlive || !otherNarwhal.isAlive) return false;
        const velocityMagnitude = Math.sqrt(
            this.velocity.x ** 2 + this.velocity.y ** 2
        );
        
        // Only allow damage if velocity is above threshold
        if (velocityMagnitude < CONFIG.MINIMUM_IMPACT_VELOCITY) {
            return false;
        }
        
        // Check tusk-to-tusk collision
        const otherVelocityMagnitude = Math.sqrt(
            otherNarwhal.velocity?.x ** 2 + otherNarwhal.velocity?.y ** 2
        ) || 0;
        
        // Get tusk coordinates
        const myTuskBase = {
            x: this.segments[0].x,
            y: this.segments[0].y
        };
        const myTuskTip = {
            x: this.segments[0].x + Math.cos(this.rotationAngle) * CONFIG.TUSK_LENGTH,
            y: this.segments[0].y + Math.sin(this.rotationAngle) * CONFIG.TUSK_LENGTH
        };
        
        const otherTuskBase = {
            x: otherNarwhal.segments[0].x,
            y: otherNarwhal.segments[0].y
        };
        const otherTuskTip = {
            x: otherNarwhal.segments[0].x + Math.cos(otherNarwhal.rotationAngle) * CONFIG.TUSK_LENGTH,
            y: otherNarwhal.segments[0].y + Math.sin(otherNarwhal.rotationAngle) * CONFIG.TUSK_LENGTH
        };
        
        // Check if tusks are intersecting
        if (this.lineLineIntersect(
            myTuskBase.x, myTuskBase.y, myTuskTip.x, myTuskTip.y,
            otherTuskBase.x, otherTuskBase.y, otherTuskTip.x, otherTuskTip.y
        )) {
            // Tusk to tusk collision, calculate knockback based on velocity difference
            return {
                tuskToTusk: true,
                knockbackForce: Math.max(5, velocityMagnitude * 1.5)
            };
        }
        
        // Check tusk to body collision
        for (let i = 0; i < otherNarwhal.bodyHitbox.length; i++) {
            const bodyPart = otherNarwhal.bodyHitbox[i];
            const hit = this.lineCircleIntersect(
                this.tuskHitbox.x1, this.tuskHitbox.y1,
                this.tuskHitbox.x2, this.tuskHitbox.y2,
                bodyPart.x, bodyPart.y, bodyPart.radius
            );
            if (hit) {
                if (i === 0) {
                    // Head hit - higher velocity needed for kill
                    if (this.isDashing || velocityMagnitude > CONFIG.KILL_VELOCITY_THRESHOLD * 0.8) {
                        return {
                            killed: true,
                            segmentIndex: i
                        };
                    }
                    return {
                        bodyHit: true,
                        segmentIndex: i,
                        knockbackForce: velocityMagnitude * CONFIG.KNOCKBACK_FORCE
                    };
                }
                // Body hit
                if (this.isDashing || velocityMagnitude > CONFIG.KILL_VELOCITY_THRESHOLD) {
                    return {
                        killed: true,
                        segmentIndex: i
                    };
                }
                return {
                    bodyHit: true,
                    knockbackForce: velocityMagnitude * CONFIG.KNOCKBACK_FORCE / 2,
                    segmentIndex: i
                };
            }
        }
        return false;
    }
    
    // Add new helper method to detect line-line intersection
    lineLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        // Calculate the direction of the lines
        const uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
        const uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
        
        // If uA and uB are between 0-1, lines are colliding
        return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
    }
    
    lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
        const dx = cx - x1;
        const dy = cy - y1;
        const ex = x2 - x1;
        const ey = y2 - y1;
        const lineLength = Math.sqrt(ex * ex + ey * ey);
        const ux = ex / lineLength;
        const uy = ey / lineLength;
        const projection = dx * ux + dy * uy;
        let closestX, closestY;
        if (projection < 0) {
            closestX = x1;
            closestY = y1;
        } else if (projection > lineLength) {
            closestX = x2;
            closestY = y2;
        } else {
            closestX = x1 + projection * ux;
            closestY = y1 + projection * uy;
        }
        const distance = Math.sqrt(
            (closestX - cx) ** 2 + (closestY - cy) ** 2
        );
        return distance < r;
    }
    
    checkNarwhalCollisions(playerPresences) {
        for (const clientId in playerPresences) {
            // Skip self or non-alive players
            if (clientId === this.id || !playerPresences[clientId].isAlive) continue;
            
            const otherNarwhal = playerPresences[clientId];
            
            // Simple circle collision between heads
            const headDistance = this.distanceTo(otherNarwhal.segments[0].x, otherNarwhal.segments[0].y);
            const minDistance = CONFIG.SEGMENT_SIZE * 1.5; // Allow some overlap
            
            if (headDistance < minDistance) {
                // Calculate push direction
                const pushAngle = Math.atan2(
                    this.segments[0].y - otherNarwhal.segments[0].y,
                    this.segments[0].x - otherNarwhal.segments[0].x
                );
                
                // Apply push force to own velocity (increased for more noticeable effect)
                const pushForce = 1.5; 
                this.velocity.x += Math.cos(pushAngle) * pushForce;
                this.velocity.y += Math.sin(pushAngle) * pushForce;
            }
        }
    }
    
    drawNarwhal(ctx, narwhal, isLocalPlayer = false) {
        const segments = narwhal.segments;
        const color = narwhal.color;
        
        // Connect segments with straighter paths for more rigid appearance
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        
        // Start at the head
        const head = segments[0];
        ctx.moveTo(head.x + (CONFIG.SEGMENT_SIZE * head.scale / 2) * Math.cos(head.angle), 
                   head.y + (CONFIG.SEGMENT_SIZE * head.scale / 2) * Math.sin(head.angle));
        
        // Create straighter, more rigid side contours
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const radius = CONFIG.SEGMENT_SIZE * segment.scale / 2;
            
            // Right side points with less curvature
            ctx.lineTo(segment.x + radius * Math.cos(segment.angle + Math.PI/2), 
                       segment.y + radius * Math.sin(segment.angle + Math.PI/2));
        }
        
        // Draw the tail
        const tailSegment = segments[segments.length - 1];
        const tailAngle = tailSegment.angle;
        const tailLength = CONFIG.SEGMENT_SIZE * 1.5;
        const finLength = CONFIG.SEGMENT_SIZE * 1.2; // How far the fins stick out
        const finSpread = Math.PI / 8; // 22.5 degrees

        ctx.beginPath();

        // Right tail fin (angled outward)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle + finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle + finSpread)
        );

        // Left tail fin (angled outward in opposite direction)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle - finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle - finSpread)
        );

        // Back to tail base (to close shape)
        ctx.lineTo(
            tailSegment.x - (CONFIG.SEGMENT_SIZE * tailSegment.scale / 2) * Math.cos(tailAngle),
            tailSegment.y - (CONFIG.SEGMENT_SIZE * tailSegment.scale / 2) * Math.sin(tailAngle)
        );

        ctx.fill();
        ctx.restore();
        
        // Draw stamina indicator for local player only (circle instead of bar)
        if (isLocalPlayer) {
            const headX = segments[0].x;
            const headY = segments[0].y;
            const staminaX = headX;
            const staminaY = headY - CONFIG.SEGMENT_SIZE - 5;
            const staminaRadius = 6;
            
            // Stamina circle
            ctx.beginPath();
            ctx.arc(staminaX, staminaY, staminaRadius, 0, Math.PI * 2);
            
            // Color based on stamina ready state
            ctx.fillStyle = narwhal.staminaReady ? 'lime' : 'red';
            ctx.fill();
            
            // Outline
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}