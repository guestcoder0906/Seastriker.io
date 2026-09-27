import { CONFIG } from '../core/config.js';
import { NarwhalCollisionHelper } from './narwhalCollisionHelper.js';

export class NarwhalCollisions {
    constructor(game) {
        this.game = game;
        this.recentCollisions = {}; // Track recent collisions to prevent multiple hits
    }
    
    // Handle collisions between narwhal segments (not just heads)
    checkSegmentCollisions(narwhal, otherPresences) {
        if (!narwhal.isAlive) return;
        
        for (const clientId in otherPresences) {
            const otherNarwhal = otherPresences[clientId];
            // Skip self completely
            if (this.game.isSelf ? this.game.isSelf(clientId, otherNarwhal) : (clientId === narwhal.id || (this.game.creature && (clientId === this.game.room.clientId || clientId === this.game.creature.id)))) continue;
            
            // Skip if other narwhal is not alive or doesn't have segments
            if (!otherNarwhal || !otherNarwhal.isAlive || !otherNarwhal.segments) continue;
            
            // Check each segment of this narwhal against each segment of the other narwhal
            for (let i = 0; i < narwhal.segments.length; i++) {
                const segment = narwhal.segments[i];
                
                for (let j = 0; j < otherNarwhal.segments.length; j++) {
                    const otherSegment = otherNarwhal.segments[j];
                    
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
                        
                        // Apply force to own narwhal
                        narwhal.velocity.x += Math.cos(angle) * pushForce;
                        narwhal.velocity.y += Math.sin(angle) * pushForce;
                        
                        return true; // Collision detected
                    }
                }
            }
        }
        
        return false; // No collision detected
    }
    
    // Improved tusk collision detection with other narwhals
    checkTuskNarwhalCollisions(narwhal, otherPresences) {
        if (!narwhal.isAlive) return null;
        
        // Create tusk line segment
        const tuskBase = {
            x: narwhal.segments[0].x,
            y: narwhal.segments[0].y
        };
        
        const tuskTip = {
            x: tuskBase.x + Math.cos(narwhal.rotationAngle) * CONFIG.TUSK_LENGTH,
            y: tuskBase.y + Math.sin(narwhal.rotationAngle) * CONFIG.TUSK_LENGTH
        };
        
        const velocityMagnitude = Math.sqrt(narwhal.velocity.x ** 2 + narwhal.velocity.y ** 2);
        
        // Only check collisions if moving fast enough
        if (velocityMagnitude < CONFIG.MINIMUM_IMPACT_VELOCITY) {
            return null;
        }
        
        for (const clientId in otherPresences) {
            const otherNarwhal = otherPresences[clientId];
            // Skip self completely
            if (this.game.isSelf ? this.game.isSelf(clientId, otherNarwhal) : (clientId === narwhal.id || (this.game.creature && (clientId === this.game.room.clientId || clientId === this.game.creature.id)))) continue;
            
            // Check for cooldown on this specific collision pair
            const collisionPairId = `${narwhal.id}-${clientId}`;
            if (this.recentCollisions[collisionPairId] && 
                performance.now() - this.recentCollisions[collisionPairId] < CONFIG.COLLISION_COOLDOWN) {
                continue; // Skip this collision check if in cooldown
            }
            
            // Skip if other narwhal is not alive or doesn't have segments
            if (!otherNarwhal || !otherNarwhal.isAlive || !otherNarwhal.segments) continue;
            
            // Cannot attack creatures hiding inside coral reefs since they are protected
            if (otherNarwhal.isHiddenInReef || (this.game.coralReefSystem && this.game.coralReefSystem.isCreatureProtectedInReef(otherNarwhal))) {
                continue;
            }
            
            // First check tusk-to-tusk collision only if other creature is also a narwhal
            if (otherNarwhal.type === 'narwhal') {
                const otherTuskAngle = typeof otherNarwhal.rotationAngle === 'number' 
                    ? otherNarwhal.rotationAngle 
                    : (otherNarwhal.segments[0]?.angle || 0);

                const otherTuskBase = {
                    x: otherNarwhal.segments[0].x,
                    y: otherNarwhal.segments[0].y
                };
                
                const otherTuskTip = {
                    x: otherTuskBase.x + Math.cos(otherTuskAngle) * CONFIG.TUSK_LENGTH,
                    y: otherTuskBase.y + Math.sin(otherTuskAngle) * CONFIG.TUSK_LENGTH
                };
                
                // Check tusk-to-tusk collision
                if (this.lineIntersection(
                    tuskBase.x, tuskBase.y, tuskTip.x, tuskTip.y,
                    otherTuskBase.x, otherTuskBase.y, otherTuskTip.x, otherTuskTip.y
                )) {
                    // Record the collision time to prevent rapid repeated hits
                    this.recentCollisions[collisionPairId] = performance.now();
                    
                    return {
                        clientId: clientId,
                        type: 'tuskToTusk',
                        knockbackForce: Math.max(4, velocityMagnitude * 1.5)
                    };
                }
            }
            
            // Then check tusk-to-segment collision
            for (let i = 0; i < otherNarwhal.segments.length; i++) {
                const segment = otherNarwhal.segments[i];
                
                // Check if tusk line intersects with segment circle
                if (this.lineCircleIntersect(
                    tuskBase.x, tuskBase.y, tuskTip.x, tuskTip.y,
                    segment.x, segment.y, CONFIG.SEGMENT_SIZE / 2
                )) {
                    // Record the collision time to prevent rapid repeated hits
                    this.recentCollisions[collisionPairId] = performance.now();
                    
                    // Determine collision type and damage
                    if (i === 0) {
                        // Head hit
                        if (narwhal.isDashing || velocityMagnitude > CONFIG.KILL_VELOCITY_THRESHOLD) {
                            return {
                                clientId: clientId,
                                type: 'lethal',
                                segment: i,
                                damage: NarwhalCollisionHelper.getTuskDamage(narwhal, 'lethal')
                            };
                        } else {
                            return {
                                clientId: clientId,
                                type: 'headHit',
                                segment: i,
                                damage: NarwhalCollisionHelper.getTuskDamage(narwhal, 'headHit')
                            };
                        }
                    } else if (i < otherNarwhal.segments.length / 2) {
                        // Body hit
                        if (narwhal.isDashing || velocityMagnitude > CONFIG.KILL_VELOCITY_THRESHOLD) {
                            return {
                                clientId: clientId,
                                type: 'lethal',
                                segment: i,
                                damage: NarwhalCollisionHelper.getTuskDamage(narwhal, 'lethal')
                            };
                        } else {
                            return {
                                clientId: clientId,
                                type: 'bodyHit',
                                segment: i,
                                damage: NarwhalCollisionHelper.getTuskDamage(narwhal, 'bodyHit')
                            };
                        }
                    } else {
                        // Tail hit
                        return {
                            clientId: clientId,
                            type: 'tailHit',
                            segment: i,
                            damage: NarwhalCollisionHelper.getTuskDamage(narwhal, 'tailHit')
                        };
                    }
                }
            }
        }
        
        return null; // No collision
    }
    
    // Line-to-line intersection check
    lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        // Calculate the direction of the lines
        const uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
        const uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
        
        // If uA and uB are between 0-1, lines are colliding
        return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
    }
    
    // Line-to-circle intersection check
    lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const a = dx * dx + dy * dy;
        const b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
        const c = cx * cx + cy * cy + x1 * x1 + y1 * y1 - 2 * (cx * x1 + cy * y1) - r * r;
        
        let discriminant = b * b - 4 * a * c;
        
        if (discriminant < 0) {
            return false;
        }
        
        discriminant = Math.sqrt(discriminant);
        const t1 = (-b - discriminant) / (2 * a);
        const t2 = (-b + discriminant) / (2 * a);
        
        return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
    }
    
    // Clean up old collision records to prevent memory leaks
    cleanupCollisionHistory() {
        const now = performance.now();
        for (const pairId in this.recentCollisions) {
            if (now - this.recentCollisions[pairId] > CONFIG.COLLISION_COOLDOWN) {
                delete this.recentCollisions[pairId];
            }
        }
    }
}