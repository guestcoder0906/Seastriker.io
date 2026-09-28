import { CONFIG } from '../core/config.js';
import { Creature } from './creature.js';

export class Squid extends Creature {
    constructor(id, x, y, color, name) {
        super(id, x, y, color, name, 'squid'); // Set type to 'squid'
        this.segments = [];
        this.tentacles = []; // Array to hold tentacles
        this.previousHeadPosition = { x: x, y: y }; // Track previous head position
        this.dashCooldown = 0;
        this.dodgeCooldown = 0;
        this.initializeSegments();
        this.speed = CONFIG.BASE_SPEED * 0.95; // Responsive swim speed
        // Add ink ability
        this.inkReady = true;
        this.inkCooldown = 0;
    }

    initializeSegments() {
        const sizeMult = (this.skinId === 'octopus') ? 
            (CONFIG.OCTOPUS_SIZE_MULTIPLIER || 0.82) : 
            (CONFIG.SQUID_SIZE_MULTIPLIER || 0.74);
        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.6 * sizeMult; // Closer segments for squid
        const headScale = 1.8 * sizeMult; // Scaled head
        const bodyScale = 1.2 * sizeMult; // Scaled body

        this.segments = [];

        // Squid Head (Rectangle) - First Segment
        this.segments.push({
            x: this.x,
            y: this.y,
            targetX: this.x,
            targetY: this.y,
            angle: this.rotationAngle,
            scale: headScale,
            isSquidHead: true, // Flag for rendering
            lastUpdateTime: Date.now() // For animation timing
        });

        // Squid Body (Rectangle) - Body Segments
        for (let i = 1; i < CONFIG.SQUID_SEGMENTS; i++) {
            const scale = bodyScale - (i / CONFIG.SQUID_SEGMENTS) * (bodyScale - CONFIG.TAIL_SCALE);
            this.segments.push({
                x: this.x - i * segmentSpacing * Math.cos(this.rotationAngle),
                y: this.y - i * segmentSpacing * Math.sin(this.rotationAngle),
                targetX: this.x - i * segmentSpacing * Math.cos(this.rotationAngle),
                targetY: this.y - i * segmentSpacing * Math.sin(this.rotationAngle),
                angle: this.rotationAngle,
                scale: scale,
                elasticity: CONFIG.SQUID_BASE_ELASTICITY // Apply base elasticity to body
            });
        }

        // Initialize EXACTLY 4 tentacles
        this.tentacles = [];
        this.initializeTentacles();
    }

    initializeTentacles() {
        const numTentacles = 4; // Fewer tentacles, all short
        const headSegment = this.segments[0];
        const tentacleLength = CONFIG.TENTACLE_LENGTH * 0.66; // Shorter tentacles
        
        // Measurements for rectangular head
        const headWidth = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.0;
        const headHeight = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.5; // Make head shorter
        
        for (let i = 0; i < numTentacles; i++) {
            const tentacleSegments = [];
            
            // Position tentacles evenly across the bottom SKINNY edge (opposite to diamond)
            // Calculate position based on the headWidth (skinny side)
            const horizontalSpread = headWidth * 0.9; // Use 90% of the width
            const horizontalOffset = horizontalSpread * (i / (numTentacles - 1) - 0.5);
            
            // The bottom of the rectangle is the SKINNY side (perpendicular to movement direction)
            const bottomOffset = headHeight / 2; // Distance from center to bottom
            
            // Rotate by 90 degrees more to point correctly - tentacles come from skinny side
            const rotatedX = horizontalOffset * Math.cos(this.rotationAngle + Math.PI/2) - 
                           bottomOffset * Math.sin(this.rotationAngle + Math.PI/2);
            const rotatedY = horizontalOffset * Math.sin(this.rotationAngle + Math.PI/2) + 
                           bottomOffset * Math.cos(this.rotationAngle + Math.PI/2);
            
            let tentacleStartX = headSegment.x + rotatedX;
            let tentacleStartY = headSegment.y + rotatedY;
            
            // Tentacles point away from the skinny side
            const tentacleAngle = this.rotationAngle + Math.PI/2;

            // Create EXACTLY 5 segments for each tentacle - NO TAPERING
            for (let j = 0; j < 5; j++) {
                // Calculate base position with increasing distance
                const segmentDistance = j * tentacleLength / 5;
                
                // Very subtle curve for natural look
                const curveAmount = (j / 5) * 0.05; // Minimal curve
                const curvedAngle = tentacleAngle + curveAmount;
                
                tentacleSegments.push({
                    x: tentacleStartX + segmentDistance * Math.cos(curvedAngle),
                    y: tentacleStartY + segmentDistance * Math.sin(curvedAngle),
                    targetX: tentacleStartX + segmentDistance * Math.cos(curvedAngle),
                    targetY: tentacleStartY + segmentDistance * Math.sin(curvedAngle),
                    angle: curvedAngle,
                    scale: 1.0, // UNIFORM scale - NO tapering
                    elasticity: CONFIG.SQUID_TENTACLE_ELASTICITY,
                    swayParams: {
                        phase: i * 0.7,
                        baseAngle: tentacleAngle
                    },
                    // Track previous positions for fluid movement
                    prevX: tentacleStartX + segmentDistance * Math.cos(curvedAngle),
                    prevY: tentacleStartY + segmentDistance * Math.sin(curvedAngle)
                });
            }
            this.tentacles.push(tentacleSegments);
        }
    }

    update(targetX, targetY, mousePressed, dodgePressed, fastSwimPressed, playerPresences) {
        if (!this.isAlive) return;

        // Store previous head position
        this.previousHeadPosition = {
            x: this.segments[0].x,
            y: this.segments[0].y,
            angle: this.segments[0].angle
        };

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

        // Update time for animations
        this.segments[0].lastUpdateTime = Date.now();

        // Compute desired angle towards target
        const dx = targetX - this.segments[0].x;
        const dy = targetY - this.segments[0].y;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
            const desiredAngle = Math.atan2(dy, dx);
            const isOctopus = this.skinId === 'octopus';
            const steerSpeed = isOctopus ? 0.10 : 0.085;
            this.rotationAngle = this.lerpAngle(this.rotationAngle, desiredAngle, steerSpeed);
        }

        const angleDiff = Math.abs(Math.atan2(Math.sin(this.rotationAngle - this.movementAngle), Math.cos(this.rotationAngle - this.movementAngle)));
        const moveLerp = angleDiff > Math.PI / 2 ? 0.08 : 0.05;
        this.movementAngle = this.lerpAngle(this.movementAngle, this.rotationAngle, moveLerp);

        // Check for dash - squids can also dash
        if (mousePressed && canBurst && !this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dashCooldown = CONFIG.RAM_COOLDOWN || CONFIG.DASH_COOLDOWN || 30;
            
            // Apply acceleration for squid dash directly towards aiming direction
            const dashAngle = this.rotationAngle;
            this.velocity.x = this.velocity.x * 0.6 + Math.cos(dashAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.4;
            this.velocity.y = this.velocity.y * 0.6 + Math.sin(dashAngle) * this.speed * CONFIG.DASH_MULTIPLIER * 0.4;
            
            setTimeout(() => {
                this.isDashing = false;
            }, CONFIG.DASH_DURATION);
        }

        // Check for dodge - squids get longer dodge duration
        if (dodgePressed && canBurst && !this.isDodging && this.dodgeCooldown <= 0) {
            this.isDodging = true;
            this.stamina = Math.max(0, this.stamina - burstCost);
            this.dodgeCooldown = CONFIG.DODGE_COOLDOWN;
            
            // Dodge is always backward from current facing direction
            let dodgeDirectionX = -Math.cos(this.rotationAngle);
            let dodgeDirectionY = -Math.sin(this.rotationAngle);
            
            // Apply dodge velocity
            this.velocity.x = this.velocity.x * 0.4 + dodgeDirectionX * CONFIG.DODGE_FORCE * 0.6;
            this.velocity.y = this.velocity.y * 0.4 + dodgeDirectionY * CONFIG.DODGE_FORCE * 0.6;
            
            // Squids get longer dodge duration
            setTimeout(() => {
                this.isDodging = false;
            }, CONFIG.SQUID_DODGE_DURATION);
        }

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
            this.velocity.x = this.velocity.x * 0.80 + moveX * 0.20;
            this.velocity.y = this.velocity.y * 0.80 + moveY * 0.20;
        } else {
            this.velocity.x *= 0.98;
            this.velocity.y *= 0.98;
        }

        // Update segment positions - more elastic for squid base
        this.segments[0].targetX = this.segments[0].x + this.velocity.x;
        this.segments[0].targetY = this.segments[0].y + this.velocity.y;

        this.segments[0].x = this.segments[0].targetX;
        this.segments[0].y = this.segments[0].targetY;
        
        // Make head face swimming direction
        this.segments[0].angle = this.movementAngle;

        const actualSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isMoving = actualSpeed > 0.4 || this.isFastSwimming;
        if (isMoving) {
            const phaseStep = this.isFastSwimming ? 0.28 : Math.min(0.18, Math.max(0.06, actualSpeed * 0.018));
            this.fastSwimPhase = (this.fastSwimPhase || 0) + phaseStep;
        }

        const sizeMult = (this.skinId === 'octopus') ? 
            (CONFIG.OCTOPUS_SIZE_MULTIPLIER || 0.82) : 
            (CONFIG.SQUID_SIZE_MULTIPLIER || 0.74);
        const segmentSpacing = CONFIG.SEGMENT_SIZE * 0.6 * sizeMult;
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const prevSegment = this.segments[i - 1];

            segment.angle = this.lerpAngle(segment.angle, prevSegment.angle, 0.2); // Faster angle follow
            segment.x = prevSegment.x - Math.cos(segment.angle) * segmentSpacing;
            segment.y = prevSegment.y - Math.sin(segment.angle) * segmentSpacing;

            // Mantle/rear waves back and forth while swimming
            if (isMoving && i > 2) {
                const waveFactor = (i - 2) / (this.segments.length - 2);
                const waveAmp = this.isFastSwimming ? 3.8 : Math.min(2.8, 0.8 + actualSpeed * 0.2);
                const waveOffset = Math.sin(this.fastSwimPhase - i * 0.6) * waveFactor * waveAmp;
                const perp = segment.angle + Math.PI / 2;
                segment.x += Math.cos(perp) * waveOffset;
                segment.y += Math.sin(perp) * waveOffset;
            }
        }

        // Update tentacle positions
        this.updateTentacles();
        
        this.handleWorldBounds();
        this.updateHitboxes();
    }
    
    updateTentacles() {
        // Skip if no tentacles (safety check)
        if (!this.tentacles || this.tentacles.length === 0) return;
        
        // Get the head segment
        const headSegment = this.segments[0];
        const headWidth = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.0;
        const headHeight = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.5;
        
        // Define tentacle length - same as in initialization
        const tentacleLength = CONFIG.TENTACLE_LENGTH * 2.0; // LONGER tentacles
        
        // LOWER the tentacles by adding an offset
        const lowerOffset = headHeight * -1; // Extra offset to lower tentacles
        
        // Calculate movement vector (how much the squid moved)
        const moveX = headSegment.x - this.previousHeadPosition.x;
        const moveY = headSegment.y - this.previousHeadPosition.y;
        const moveMagnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        
        // Calculate angular velocity (how fast the squid is turning)
        const angleDiff = this.normalizeAngle(headSegment.angle - this.previousHeadPosition.angle);
        
        // Update each tentacle - EXACTLY 4
        for (let t = 0; t < this.tentacles.length; t++) {
            const tentacleSegments = this.tentacles[t];
            
            // Calculate position along bottom edge (skinny side)
            const fraction = this.tentacles.length > 1 ? t / (this.tentacles.length - 1) : 0.5;
            const horizontalFactor = (fraction - 0.5) * 0.8; // Range: -0.4 to 0.4 (80% of width)
            
            // Calculate coordinates along the bottom edge
            // Reference angle is the perpendicular to squid direction
            const perpAngle = headSegment.angle + Math.PI/2;
            
            // Position along the bottom edge - using 80% of width
            const horizontalOffset = horizontalFactor * headWidth;
            
            // Calculate the center of the bottom edge WITH LOWER OFFSET
            const bottomEdgeX = headSegment.x + Math.cos(headSegment.angle) * (headHeight / 2 + lowerOffset);
            const bottomEdgeY = headSegment.y + Math.sin(headSegment.angle) * (headHeight / 2 + lowerOffset);
            
            // Final position of tentacle start - offset horizontally along bottom edge
            const tentacleStartX = bottomEdgeX + Math.cos(perpAngle) * horizontalOffset;
            const tentacleStartY = bottomEdgeY + Math.sin(perpAngle) * horizontalOffset;
            
            // FLIP tentacles 180 degrees - opposite to squid direction
            const tentacleAngle = headSegment.angle + Math.PI; // Point 180° opposite to movement
            
            // Update first segment of tentacle
            tentacleSegments[0].prevX = tentacleSegments[0].x;
            tentacleSegments[0].prevY = tentacleSegments[0].y;
            
            tentacleSegments[0].targetX = tentacleStartX;
            tentacleSegments[0].targetY = tentacleStartY;
            tentacleSegments[0].angle = tentacleAngle;
            
            tentacleSegments[0].x = tentacleSegments[0].targetX;
            tentacleSegments[0].y = tentacleSegments[0].targetY;
            
            // Determine the turning influence for this tentacle
            // Left tentacles (t=0,1) bend opposite to right tentacles (t=2,3) during turns
            const turnDirection = t < this.tentacles.length / 2 ? -1 : 1;
            const turnInfluence = angleDiff * 15 * turnDirection; // Amplify effect
            
            // Get the game time for animations
            const gameTime = Date.now() / 1000;
            
            // Generate unique wave patterns for this tentacle
            // Different phases and frequencies for each tentacle
            const tentaclePhase = t * 0.7;
            const waveFreq = 1.5 + (t % 2) * 0.2; // Slightly different frequencies
            
            // Calculate initial momentum for this tentacle
            // This creates variation in how each tentacle behaves
            const initialMomentum = {
                x: Math.cos(gameTime * 0.8 + tentaclePhase) * 0.3,
                y: Math.sin(gameTime * 0.7 + tentaclePhase) * 0.3
            };
            
            // Previous position cumulative offset for fluid wave propagation
            let cumulativeOffsetX = 0;
            let cumulativeOffsetY = 0;
            
            // Update remaining tentacle segments with flowing S-curved movement
            for (let i = 1; i < tentacleSegments.length; i++) {
                const segment = tentacleSegments[i];
                const prevSegment = tentacleSegments[i - 1];
                
                // Save current position before updating
                segment.prevX = segment.x;
                segment.prevY = segment.y;
                
                // Position-based factors
                const segmentFraction = i / (tentacleSegments.length - 1); // 0 to 1
                const segmentDistanceFactor = segmentFraction * segmentFraction; // Exponential effect at the tip
                
                // Calculate segment length
                const segLength = tentacleLength / tentacleSegments.length;
                
                // Get sine wave phase for this segment - different wave speeds based on position
                // This creates undulating motion that travels down the tentacle
                const waveSpeed = 0.65 + segmentFraction * 0.35; // Waves travel faster toward the tip
                const wavePhase = gameTime * waveSpeed + tentaclePhase + i * 0.3;
                
                // Create two overlapping waves with different frequencies for more complex movement
                const primaryWave = Math.sin(wavePhase) * 0.15 * segmentDistanceFactor;
                const secondaryWave = Math.cos(wavePhase * 0.7) * 0.08 * segmentDistanceFactor;
                
                // Combined wave effect
                const combinedWave = primaryWave + secondaryWave;
                
                // Add movement-based curling
                // When moving quickly, tentacles curl backward more
                const movementCurl = Math.min(moveMagnitude * 0.05, 0.2) * segmentDistanceFactor;
                
                // Turning creates stronger curling in the opposite direction
                const turnCurl = turnInfluence * 0.8 * segmentDistanceFactor;
                
                // Calculate segment angle with all effects combined
                const baseAngle = tentacleAngle + combinedWave + movementCurl + turnCurl;
                
                // Prevent sharp angles between segments - smooth transitions
                // This is key for natural curves rather than sharp bends
                let targetAngle;
                if (i > 1) {
                    // For segments after the first, blend with previous segment's angle
                    // This creates smooth curvature throughout the tentacle
                    const prevAngle = tentacleSegments[i-1].angle;
                    const maxAngleChange = 0.3; // Limit how sharply a tentacle can bend
                    
                    // Calculate angle difference and limit it
                    let angleDiff = this.normalizeAngle(baseAngle - prevAngle);
                    angleDiff = Math.max(Math.min(angleDiff, maxAngleChange), -maxAngleChange);
                    
                    // Apply smoothed angle
                    targetAngle = prevAngle + angleDiff;
                } else {
                    targetAngle = baseAngle;
                }
                
                // Apply wave propagation effect - waves travel down the tentacle
                // Use cumulative offset to create a traveling wave effect
                cumulativeOffsetX = cumulativeOffsetX * 0.8 + initialMomentum.x * segmentDistanceFactor;
                cumulativeOffsetY = cumulativeOffsetY * 0.8 + initialMomentum.y * segmentDistanceFactor;
                
                // Calculate perpendicuar offset for additional curves
                // This adds sideways displacement based on the wave
                const perpX = Math.cos(targetAngle + Math.PI/2) * combinedWave * segLength * 1.2;
                const perpY = Math.sin(targetAngle + Math.PI/2) * combinedWave * segLength * 1.2;
                
                // Create a lag effect proportional to movement speed
                const lagFactor = segmentDistanceFactor * 2.0;
                const dragX = -moveX * lagFactor;
                const dragY = -moveY * lagFactor;
                
                // Calculate the ideal position with all effects combined
                const idealX = prevSegment.x + Math.cos(targetAngle) * segLength + perpX + dragX + cumulativeOffsetX;
                const idealY = prevSegment.y + Math.sin(targetAngle) * segLength + perpY + dragY + cumulativeOffsetY;
                
                // Calculate this segment's movement delay - more delay at the tip for fluid motion
                const delayFactor = 0.2 + segmentFraction * 0.3;
                
                // Smoothly interpolate towards the ideal position 
                segment.x = segment.x * (1 - delayFactor) + idealX * delayFactor;
                segment.y = segment.y * (1 - delayFactor) + idealY * delayFactor;
                
                // Set the segment angle based on its actual position relative to previous segment
                const dx = segment.x - prevSegment.x;
                const dy = segment.y - prevSegment.y;
                segment.angle = Math.atan2(dy, dx);
                
                // Maintain exact segment length to prevent gaps
                const currentLength = Math.sqrt(dx * dx + dy * dy);
                if (currentLength > 0) {
                    segment.x = prevSegment.x + (dx / currentLength) * segLength;
                    segment.y = prevSegment.y + (dy / currentLength) * segLength;
                }
            }
        }
    }
    
    // Helper function to normalize angle to range [-PI, PI]
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    updateHitboxes() {
        this.bodyHitbox = [];
        
        // Head hitbox (rectangular approximation using multiple circles)
        const headSegment = this.segments[0];
        const headWidth = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.0; // Updated to match new dimensions
        const headHeight = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.8; // Updated to match new dimensions
        
        // Add head hitbox points
        const headPointCount = 4; // More points for better collision
        for (let i = 0; i < headPointCount; i++) {
            const offsetX = (i % 2 === 0 ? -1 : 1) * headWidth / 2;
            const offsetY = (i < 2 ? -1 : 1) * headHeight / 2;
            
            // Rotate offset by head angle
            const rotatedX = offsetX * Math.cos(headSegment.angle) - offsetY * Math.sin(headSegment.angle);
            const rotatedY = offsetX * Math.sin(headSegment.angle) + offsetY * Math.cos(headSegment.angle);
            
            this.bodyHitbox.push({
                x: headSegment.x + rotatedX,
                y: headSegment.y + rotatedY,
                radius: CONFIG.SEGMENT_SIZE * 0.5
            });
        }
        
        // Add body segment hitboxes
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            this.bodyHitbox.push({
                x: segment.x,
                y: segment.y,
                radius: CONFIG.SEGMENT_SIZE * segment.scale / 2
            });
        }
        
        // Add tentacle hitboxes
        for (let tentacle of this.tentacles) {
            for (let i = 0; i < tentacle.length; i += 2) { // Add every other segment to save on hitbox count
                const segment = tentacle[i];
                this.bodyHitbox.push({
                    x: segment.x,
                    y: segment.y,
                    radius: CONFIG.TENTACLE_THICKNESS * segment.scale / 2
                });
            }
        }
    }

    checkSelfCollision() {
        return false; // Squids don't have tusks for self-collision
    }

    getPresenceData() {
        const presence = super.getPresenceData();
        presence.segments = this.segments.map(s => ({
            x: s.x,
            y: s.y,
            angle: s.angle,
            scale: s.scale,
            isSquidHead: s.isSquidHead
        }));
        presence.tentacles = this.tentacles.map(tentacle => tentacle.map(s => ({
            x: s.x,
            y: s.y,
            angle: s.angle,
            scale: s.scale
        })));
        
        // Add ink ability and camouflage data
        presence.inkReady = this.inkReady;
        presence.inkCooldown = this.inkCooldown;
        presence.isCamouflaged = Boolean(this.isCamouflaged);
        presence.camouflageActiveTimer = this.camouflageActiveTimer || 0;
        
        return presence;
    }
}