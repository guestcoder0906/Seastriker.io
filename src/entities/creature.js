import { CONFIG } from '../core/config.js';

// Base class for all sea creatures (Narwhal, Shark, etc.)
export class Creature {
    constructor(id, x, y, color, name, type) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.rotationAngle = 0;
        this.movementAngle = 0;
        this.segments = [];
        this.color = color;
        this.name = name;
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.speed = CONFIG.BASE_SPEED;
        this.isDashing = false;
        this.isDodging = false;
        this.dashCooldown = 0;
        this.dodgeCooldown = 0;
        this.staminaReady = true;
        this.staminaCooldown = 0;
        this.stamina = 1.0; // Gradual stamina (1.0 = green, 0.0 = red)
        this.isFastSwimming = false;
        this.isExhausted = false;
        this.isSprintExhausted = false;
        this.fastSwimPhase = 0;
        this.kills = 0;
        this.isAlive = true;
        this.health = CONFIG.MAX_HEALTH;
        this.type = type; // 'narwhal' or 'shark' or 'squid'
        
        // Upgrade properties
        this.upgrades = {};
        this.tuskLengthModifier = 1.0;
        this.staminaCooldownModifier = 1.0;
        this.speedModifier = 1.0;
        
        // Skin properties
        this.skinId = 'default';
        this.skinName = '';
        
        // New properties for squid
        this.inkReady = true;
        this.inkCooldown = 0;
        this.inkCooldownModifier = 1.0;
        this.tentacleDamageModifier = 1.0;
        
        // Add a property to track if creature is hidden in reef
        this.isHiddenInReef = false;
    }

    // Helper to smoothly interpolate between angles safely without while loops
    lerpAngle(from, to, t) {
        if (!Number.isFinite(from)) from = 0;
        if (!Number.isFinite(to)) to = 0;
        const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
        return from + diff * Math.min(1.0, Math.max(0, t));
    }

    // Helper for linear interpolation between two values
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    // Abstract methods to be implemented by subclasses
    initializeSegments() {}
    update(targetX, targetY, mousePressed, dodgePressed, playerPresences) {
        if (!this.isAlive) return;
        
        // Continue with normal update
        // ... rest of update implementation in subclasses ...
    }
    drawCreature() {}
    checkSelfCollision() {}
    updateHitboxes() {}
    
    // Common methods for all creatures
    distanceTo(x, y) {
        const dx = this.segments[0].x - x;
        const dy = this.segments[0].y - y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    handleWorldBounds() {
        const head = this.segments[0];
        const radius = CONFIG.SEGMENT_SIZE / 2;
        if (head.x - radius < 0) {
            head.x = radius;
            this.velocity.x *= -0.5;
        } else if (head.x + radius > CONFIG.WORLD_WIDTH) {
            head.x = CONFIG.WORLD_WIDTH - radius;
            this.velocity.x *= -0.5;
        }
        if (head.y - radius < 0) {
            head.y = radius;
            this.velocity.y *= -0.5;
        } else if (head.y + radius > CONFIG.WORLD_HEIGHT) {
            head.y = CONFIG.WORLD_HEIGHT - radius;
            this.velocity.y *= -0.5;
        }
    }
    
    die() {
        this.isAlive = false;
    }
    
    respawn(x, y) {
        this.x = x;
        this.y = y;
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.isDashing = false;
        this.isDodging = false;
        this.staminaReady = true;
        this.staminaCooldown = 0;
        this.isAlive = true;
        this.health = CONFIG.MAX_HEALTH;
        this.kills = 0;
        
        // Reset upgrades
        this.upgrades = {};
        this.tuskLengthModifier = 1.0;
        this.staminaCooldownModifier = 1.0;
        this.speedModifier = 1.0;
        
        // Set correct base speed based on creature type
        if (this.type === 'shark') {
            this.speed = CONFIG.BASE_SPEED * CONFIG.SHARK_SPEED_MULTIPLIER;
        } else {
            this.speed = CONFIG.BASE_SPEED;
        }
        
        // Set correct segment elasticity based on creature type
        if (this.type === 'shark') {
            CONFIG.ELASTICITY = CONFIG.SHARK_SEGMENT_ELASTICITY;
        } else {
            CONFIG.ELASTICITY = 0.01; // Default narwhal elasticity
        }
        
        this.segments = [];
        this.initializeSegments();
    }
    
    getPresenceData() {
        return {
            id: this.id,
            x: this.segments[0].x,
            y: this.segments[0].y,
            segments: this.segments.map(s => ({
                x: s.x,
                y: s.y,
                angle: s.angle,
                scale: s.scale,
                round: s.round
            })),
            color: this.color,
            name: this.name,
            velocity: this.velocity,
            isDashing: this.isDashing,
            isDodging: this.isDodging,
            staminaReady: this.staminaReady,
            stamina: this.stamina,
            isFastSwimming: this.isFastSwimming,
            kills: this.kills,
            isAlive: this.isAlive,
            health: this.health,
            upgrades: this.upgrades,
            tuskLengthModifier: this.tuskLengthModifier,
            staminaCooldownModifier: this.staminaCooldownModifier,
            speedModifier: this.speedModifier,
            type: this.type,
            skinId: this.skinId,
            skinName: this.skinName,
            inkReady: this.inkReady,
            inkCooldown: this.inkCooldown,
            inkCooldownModifier: this.inkCooldownModifier,
            tentacleDamageModifier: this.tentacleDamageModifier,
            isHiddenInReef: Boolean(this.isHiddenInReef),
            isCamouflaged: Boolean(this.isCamouflaged),
            camouflageActiveTimer: this.camouflageActiveTimer || 0,
        };
    }
    
    // Shared utility methods
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
}