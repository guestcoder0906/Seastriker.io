import { CONFIG } from '../core/config.js';

export class CoralReefSystem {
    constructor(game) {
        this.game = game;
        this.coralReefs = [];
        this.hiddenCreatures = {}; 
        this.rng = this.mulberry32(123456789); // Fixed seed for consistency
        this.initializeCoralReefs();
    }

    mulberry32(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    randomBetween(min, max) {
        return min + this.rng() * (max - min);
    }
    
    initializeCoralReefs() {
        const reefCount = 12; 
        const minSize = 150;  
        const maxSize = 250;  
    
        for (let i = 0; i < reefCount; i++) {
            const margin = 300; 
            let attempts = 0;
            let validPosition = false;
            let reef;
            
            while (!validPosition && attempts < 20) {
                const x = margin + this.randomBetween(0, CONFIG.WORLD_WIDTH - 2 * margin);
                const y = margin + this.randomBetween(0, CONFIG.WORLD_HEIGHT - 2 * margin);
                const width = this.randomBetween(minSize, maxSize);
                const height = this.randomBetween(minSize, maxSize);
                
                reef = {
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    points: this.generateJaggedPoints(x, y, width, height),
                    color: this.getRandomReefColor()
                };
                
                validPosition = true;
                for (const existingReef of this.coralReefs) {
                    const dx = existingReef.x - x;
                    const dy = existingReef.y - y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < (existingReef.width + width) / 1.5) {
                        validPosition = false;
                        break;
                    }
                }
                
                attempts++;
            }
            
            if (validPosition) {
                this.coralReefs.push(reef);
            }
        }
    }

    generateJaggedPoints(x, y, width, height) {
        const points = [];
        const numPoints = 12; 
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            
            const baseRadius = i % 2 === 0 ? 
                width / 2 * (0.8 + this.randomBetween(0, 0.4)) : 
                height / 2 * (0.8 + this.randomBetween(0, 0.4));
            
            const jaggedness = 0.25; 
            const radius = baseRadius * (1 - jaggedness + this.randomBetween(0, jaggedness * 2));
            
            points.push({
                x: x + Math.cos(angle) * radius,
                y: y + Math.sin(angle) * radius
            });
        }
        
        return points;
    }
    
    getRandomReefColor() {
        const colors = [
            '#FF6F61', '#FF9671', '#FFC75F', '#F9F871',
            '#D65DB1', '#845EC2', '#00C9A7', '#008AC5'
        ];
        return colors[Math.floor(this.randomBetween(0, colors.length))];
    }
    
    update() {
        for (const clientId in this.game.playerPresences) {
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;

            const creature = this.getCreature(clientId);
            if (!creature) continue;

            const isSmallCreature = this.isSmallCreature(presence);
            let inReef = false;

            for (const reef of this.coralReefs) {
                if (isSmallCreature && this.isInReef(presence.segments[0], reef)) {
                    inReef = true;
                    this.handleSmallCreatureInReef(clientId, creature, reef);
                    break;
                }
                // Sharks and narwhals can now freely go through coral reefs without being blocked or repelled
            }

            // Only restore if completely out of all reefs
            if (!inReef && this.hiddenCreatures[clientId]) {
                this.restoreCreatureFromHiding(clientId, creature);
            }
        }
    }
    
    // Check if creature is protected while hiding inside a coral reef
    isCreatureProtectedInReef(presence) {
        if (!presence || !presence.isAlive) return false;
        if (presence.isHiddenInReef) return true;
        // Also check if small creature is physically inside any coral reef polygon
        if (this.isSmallCreature(presence) && presence.segments && presence.segments[0]) {
            return this.isPointInAnyReef(presence.segments[0]);
        }
        return false;
    }

    isPointInAnyReef(point) {
        if (!point) return false;
        for (const reef of this.coralReefs) {
            if (this.isInReef(point, reef)) {
                return true;
            }
        }
        return false;
    }
    
    isInReef(point, reef) {
        return this.pointInPolygon(point.x, point.y, reef.points);
    }
    
    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
            if (intersect) inside = !inside;
        }
        
        return inside;
    }
    
    isNearReefEdge(point, reef) {
        if (this.isInReef(point, reef)) {
            return false; 
        }
        
        const nearestPoint = this.findNearestEdgePoint(point.x, point.y, reef);
        const dx = point.x - nearestPoint.x;
        const dy = point.y - nearestPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance < 50; 
    }
    
    isSmallCreature(presence) {
        return presence.type === 'squid' || presence.type === 'knifefish';
    }
    
    getCreature(clientId) {
        if (clientId === this.game.room.clientId) {
            return this.game.creature;
        } else if (clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
            return this.game.aiController.aiPlayers[clientId].creature;
        }
        return null;
    }
    
    handleSmallCreatureInReef(clientId, creature, reef) {
        if (!this.hiddenCreatures[clientId]) {
            this.hiddenCreatures[clientId] = {
                isHidden: true
            };
        }

        creature.isHiddenInReef = true;

        if (clientId === this.game.room.clientId) {
            this.game.room.updatePresence({
                isHiddenInReef: true
            });
        } else if (clientId.startsWith('ai-')) {
            if (this.game.aiController.aiPresences[clientId]) {
                this.game.aiController.aiPresences[clientId].isHiddenInReef = true;
                this.game.playerPresences[clientId] = this.game.aiController.aiPresences[clientId];
            }
        }
    }
  
    handleLargeCreatureCollision(clientId, creature, reef) {
        if (!creature || !creature.segments || !creature.segments[0]) return;
        
        const head = creature.segments[0];
        const nearestPoint = this.findNearestEdgePoint(head.x, head.y, reef);
        
        const dx = head.x - nearestPoint.x;
        const dy = head.y - nearestPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 50) { 
            const magnitude = Math.sqrt(dx * dx + dy * dy);
            const dirX = dx / magnitude;
            const dirY = dy / magnitude;
            
            const pushStrength = Math.max(5, 30 * (1 - distance / 50));
            
            creature.velocity.x += dirX * pushStrength;
            creature.velocity.y += dirY * pushStrength;
            
            if (clientId === this.game.room.clientId) {
                this.game.room.updatePresence({
                    velocity: creature.velocity
                });
            } else if (clientId.startsWith('ai-') && this.game.aiController.aiPresences) {
                if (this.game.aiController.aiPresences[clientId]) {
                    this.game.aiController.aiPresences[clientId].velocity = creature.velocity;
                    this.game.playerPresences[clientId] = this.game.aiController.aiPresences[clientId];
                }
            }
        }
    }
    
    findNearestEdgePoint(x, y, reef) {
        let minDistance = Number.MAX_VALUE;
        let nearestPoint = reef.points[0];
        
        for (let i = 0, j = reef.points.length - 1; i < reef.points.length; j = i++) {
            const point = this.findNearestPointOnLine(
                x, y, 
                reef.points[i].x, reef.points[i].y, 
                reef.points[j].x, reef.points[j].y
            );
            
            const dx = x - point.x;
            const dy = y - point.y;
            const distance = dx * dx + dy * dy;
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = point;
            }
        }
        
        return nearestPoint;
    }
    
    findNearestPointOnLine(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) {
            return { x: x1, y: y1 };
        }
        
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
        
        return {
            x: x1 + t * dx,
            y: y1 + t * dy
        };
    }
    
    restoreCreatureFromHiding(clientId, creature) {
        creature.isHiddenInReef = false;

        if (clientId === this.game.room.clientId) {
            this.game.room.updatePresence({
                isHiddenInReef: false
            });
        } else if (clientId.startsWith('ai-')) {
            if (this.game.aiController.aiPresences[clientId]) {
                this.game.aiController.aiPresences[clientId].isHiddenInReef = false;
                this.game.playerPresences[clientId] = this.game.aiController.aiPresences[clientId];
            }
        }

        delete this.hiddenCreatures[clientId];
    }

    drawCoralReefs(ctx) {
        ctx.save();
        
        for (const reef of this.coralReefs) {
            ctx.fillStyle = reef.color;
            
            ctx.beginPath();
            ctx.moveTo(reef.points[0].x, reef.points[0].y);
            
            for (let i = 1; i < reef.points.length; i++) {
                ctx.lineTo(reef.points[i].x, reef.points[i].y);
            }
            
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawCoralReefOverlay(ctx, creature) {
        // Overlay removed to avoid visual obstruction
    }
    
    shouldRenderCreature(presence) {
        // Creatures should never vanish or disappear randomly from the screen.
        // Protected status in reefs is handled via collision and damage immunity.
        return true;
    }
}