import { CONFIG } from '../core/config.js';

export class CoralReefSystem {
    constructor(game) {
        this.game = game;
        this.rocks = [];
        this.coralReefs = this.rocks; // Backwards compatibility alias
        this.hiddenCreatures = {}; 
        this.rng = this.mulberry32(987654321); // Seeded random generator
        this.initializeRocks();
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
    
    initializeRocks() {
        const rockCount = CONFIG.ROCK_COUNT || 14; 
        const minSize = CONFIG.ROCK_MIN_SIZE || 160;  
        const maxSize = CONFIG.ROCK_MAX_SIZE || 280;  
    
        for (let i = 0; i < rockCount; i++) {
            const margin = 260; 
            let attempts = 0;
            let validPosition = false;
            let rock;
            
            while (!validPosition && attempts < 35) {
                const x = margin + this.randomBetween(0, CONFIG.WORLD_WIDTH - 2 * margin);
                const y = margin + this.randomBetween(0, CONFIG.WORLD_HEIGHT - 2 * margin);
                const width = this.randomBetween(minSize, maxSize);
                const height = this.randomBetween(minSize, maxSize);
                
                rock = {
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    points: this.generateBeveledRockPoints(x, y, width, height),
                    facets: this.generateRockFacets(x, y, width, height),
                    shades: this.getRandomRockShades(),
                    subRocks: this.generateSubRocks(x, y, width, height)
                };
                
                validPosition = true;
                for (const existingRock of this.rocks) {
                    const dx = existingRock.x - x;
                    const dy = existingRock.y - y;
                    const distance = Math.hypot(dx, dy);
                    
                    if (distance < (existingRock.width + width) / 1.7) {
                        validPosition = false;
                        break;
                    }
                }
                
                attempts++;
            }
            
            if (validPosition && rock) {
                this.rocks.push(rock);
            }
        }
    }

    // Generate rock perimeter with beveled edges and facets in organic stone shapes
    generateBeveledRockPoints(x, y, width, height) {
        // Start with 9 to 13 primary rock angular vertices around the center
        const numPrimary = Math.floor(this.randomBetween(9, 13));
        const primaryPoints = [];
        
        for (let i = 0; i < numPrimary; i++) {
            const baseAngle = (i / numPrimary) * Math.PI * 2 + this.randomBetween(-0.12, 0.12);
            const radiusX = (width / 2) * this.randomBetween(0.72, 1.12);
            const radiusY = (height / 2) * this.randomBetween(0.72, 1.12);
            
            primaryPoints.push({
                x: x + Math.cos(baseAngle) * radiusX,
                y: y + Math.sin(baseAngle) * radiusY
            });
        }
        
        // Chamfer / bevel every corner randomly to remove sharp knife-edges and create beveled stone contours
        const beveledPoints = [];
        const n = primaryPoints.length;
        
        for (let i = 0; i < n; i++) {
            const prev = primaryPoints[(i - 1 + n) % n];
            const curr = primaryPoints[i];
            const next = primaryPoints[(i + 1) % n];
            
            // Random bevel factor for this vertex (18% to 42% cut)
            const bevelCut1 = this.randomBetween(0.20, 0.38);
            const bevelCut2 = this.randomBetween(0.20, 0.38);
            
            // First beveled vertex approaching the corner
            const b1 = {
                x: curr.x + (prev.x - curr.x) * bevelCut1,
                y: curr.y + (prev.y - curr.y) * bevelCut1
            };
            
            // Optional mid-bevel chamfer facet
            const midBevelOffset = this.randomBetween(-0.06, 0.06);
            const bMid = {
                x: curr.x * (1 - midBevelOffset) + ((b1.x + curr.x) / 2) * midBevelOffset,
                y: curr.y * (1 - midBevelOffset) + ((b1.y + curr.y) / 2) * midBevelOffset
            };
            
            // Second beveled vertex leaving the corner
            const b2 = {
                x: curr.x + (next.x - curr.x) * bevelCut2,
                y: curr.y + (next.y - curr.y) * bevelCut2
            };
            
            beveledPoints.push(b1);
            if (this.randomBetween(0, 1) > 0.4) {
                beveledPoints.push(bMid);
            }
            beveledPoints.push(b2);
        }
        
        return beveledPoints;
    }

    // Generate internal crystalline / beveled strata facets across the rock face
    generateRockFacets(cx, cy, width, height) {
        const facets = [];
        const numFacets = Math.floor(this.randomBetween(3, 6));
        
        for (let f = 0; f < numFacets; f++) {
            const facetVertices = [];
            const facetCenterX = cx + this.randomBetween(-width * 0.28, width * 0.28);
            const facetCenterY = cy + this.randomBetween(-height * 0.28, height * 0.28);
            const facetRadius = this.randomBetween(width * 0.16, width * 0.36);
            const facetSides = Math.floor(this.randomBetween(4, 7));
            
            for (let s = 0; s < facetSides; s++) {
                const angle = (s / facetSides) * Math.PI * 2 + this.randomBetween(-0.25, 0.25);
                const r = facetRadius * this.randomBetween(0.65, 1.15);
                facetVertices.push({
                    x: facetCenterX + Math.cos(angle) * r,
                    y: facetCenterY + Math.sin(angle) * r
                });
            }
            
            facets.push(facetVertices);
        }
        
        return facets;
    }

    // Generate small boulder pebbles attached to the cluster
    generateSubRocks(cx, cy, width, height) {
        const subRocks = [];
        const count = Math.floor(this.randomBetween(2, 4));
        
        for (let i = 0; i < count; i++) {
            const angle = this.randomBetween(0, Math.PI * 2);
            const dist = (Math.max(width, height) / 2) * this.randomBetween(0.85, 1.18);
            const subW = width * this.randomBetween(0.20, 0.35);
            const subH = height * this.randomBetween(0.20, 0.35);
            const subX = cx + Math.cos(angle) * dist;
            const subY = cy + Math.sin(angle) * dist;
            
            subRocks.push({
                x: subX,
                y: subY,
                points: this.generateBeveledRockPoints(subX, subY, subW, subH)
            });
        }
        
        return subRocks;
    }
    
    // Realistic slate and granite grey palettes
    getRandomRockShades() {
        const greyPalettes = [
            {
                base: '#374151',       // Dark Charcoal Slate
                highlight: '#6b7280',  // Medium Grey
                shadow: '#1f2937',     // Deep Basalt Grey
                accent: '#4b5563',     // Stone Grey
                bevelTop: 'rgba(255, 255, 255, 0.24)',
                bevelBottom: 'rgba(0, 0, 0, 0.45)'
            },
            {
                base: '#334155',       // Cool Slate Granite
                highlight: '#64748b',  // Cool Light Slate
                shadow: '#1e293b',     // Deep Navy-Grey Stone
                accent: '#475569',     // Slate Grey
                bevelTop: 'rgba(255, 255, 255, 0.28)',
                bevelBottom: 'rgba(0, 0, 0, 0.42)'
            },
            {
                base: '#3f3f46',       // Weathered Zinc Stone
                highlight: '#71717a',  // Pale Granite Grey
                shadow: '#18181b',     // Volcanic Basalt
                accent: '#52525b',     // Zinc Grey
                bevelTop: 'rgba(255, 255, 255, 0.22)',
                bevelBottom: 'rgba(0, 0, 0, 0.48)'
            },
            {
                base: '#44403c',       // Warm Riverbed Stone
                highlight: '#78716c',  // Sandstone Grey
                shadow: '#1c1917',     // Dark Pebble Shadow
                accent: '#57534e',     // Warm Stone
                bevelTop: 'rgba(255, 255, 255, 0.25)',
                bevelBottom: 'rgba(0, 0, 0, 0.45)'
            }
        ];
        
        const selected = greyPalettes[Math.floor(this.randomBetween(0, greyPalettes.length))];
        return selected;
    }
    
    // Check if creature is excluded from rock slowdown (Sharks, Narwhals, Dolphins, Hammerheads)
    isCreatureExcludedFromRockSlow(creatureOrPresence) {
        if (!creatureOrPresence) return false;
        const type = creatureOrPresence.type;
        const skinId = creatureOrPresence.skinId;
        return type === 'shark' || type === 'narwhal' || type === 'dolphin' || skinId === 'hammerhead';
    }

    update() {
        for (const clientId in this.game.playerPresences) {
            const presence = this.game.playerPresences[clientId];
            if (!presence || !presence.isAlive || !presence.segments || !presence.segments[0]) continue;

            const creature = this.getCreature(clientId);
            const head = presence.segments[0];
            const inRock = this.isPointInAnyRock(head);

            if (inRock) {
                this.handleCreatureInRock(clientId, creature, presence);
            } else if (this.hiddenCreatures[clientId]) {
                this.restoreCreatureFromRock(clientId, creature);
            }
        }
    }
    
    // Check if creature is protected while inside a rock formation (like coral reefs)
    isCreatureProtectedInReef(presence) {
        if (!presence || !presence.isAlive) return false;
        if (presence.isInRock || presence.isHiddenInReef) return true;
        if (presence.segments && presence.segments[0]) {
            return this.isPointInAnyRock(presence.segments[0]);
        }
        return false;
    }

    isCreatureProtectedInRock(presence) {
        return this.isCreatureProtectedInReef(presence);
    }

    isPointInAnyRock(point) {
        if (!point) return false;
        for (const rock of this.rocks) {
            if (this.isInRock(point, rock)) {
                return true;
            }
        }
        return false;
    }

    isPointInAnyReef(point) {
        return this.isPointInAnyRock(point);
    }
    
    isInRock(point, rock) {
        if (!point || !rock || !rock.points) return false;
        if (this.pointInPolygon(point.x, point.y, rock.points)) {
            return true;
        }
        // Also check sub-rocks
        if (rock.subRocks) {
            for (const sub of rock.subRocks) {
                if (this.pointInPolygon(point.x, point.y, sub.points)) {
                    return true;
                }
            }
        }
        return false;
    }

    isInReef(point, reef) {
        return this.isInRock(point, reef);
    }
    
    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
            if (intersect) inside = !inside;
        }
        
        return inside;
    }
    
    getCreature(clientId) {
        if (clientId === this.game.room.clientId) {
            return this.game.creature;
        } else if (clientId.startsWith('ai-') && this.game.aiController.aiPlayers[clientId]) {
            return this.game.aiController.aiPlayers[clientId].creature;
        }
        return null;
    }
    
    handleCreatureInRock(clientId, creature, presence) {
        if (!this.hiddenCreatures[clientId]) {
            this.hiddenCreatures[clientId] = {
                isInRock: true
            };
        }

        if (creature) {
            creature.isInRock = true;
            creature.isHiddenInReef = true;
        }

        if (clientId === this.game.room.clientId) {
            this.game.room.updatePresence({
                isInRock: true,
                isHiddenInReef: true
            });
        } else if (clientId.startsWith('ai-')) {
            if (this.game.aiController.aiPresences[clientId]) {
                this.game.aiController.aiPresences[clientId].isInRock = true;
                this.game.aiController.aiPresences[clientId].isHiddenInReef = true;
                this.game.playerPresences[clientId] = this.game.aiController.aiPresences[clientId];
            }
        }
    }
    
    restoreCreatureFromRock(clientId, creature) {
        if (creature) {
            creature.isInRock = false;
            creature.isHiddenInReef = false;
        }

        if (clientId === this.game.room.clientId) {
            this.game.room.updatePresence({
                isInRock: false,
                isHiddenInReef: false
            });
        } else if (clientId.startsWith('ai-')) {
            if (this.game.aiController.aiPresences[clientId]) {
                this.game.aiController.aiPresences[clientId].isInRock = false;
                this.game.aiController.aiPresences[clientId].isHiddenInReef = false;
                this.game.playerPresences[clientId] = this.game.aiController.aiPresences[clientId];
            }
        }

        delete this.hiddenCreatures[clientId];
    }

    restoreCreatureFromHiding(clientId, creature) {
        this.restoreCreatureFromRock(clientId, creature);
    }

    // Render beveled underwater rock formations in organic shades of grey
    drawCoralReefs(ctx) {
        this.drawRocks(ctx);
    }

    drawRocks(ctx) {
        ctx.save();
        ctx.lineJoin = 'bevel';
        ctx.lineCap = 'butt';
        
        for (const rock of this.rocks) {
            const shades = rock.shades;
            
            // 1. Draw sub-rocks attached to the boulder cluster
            if (rock.subRocks) {
                for (const sub of rock.subRocks) {
                    ctx.fillStyle = shades.shadow;
                    ctx.beginPath();
                    ctx.moveTo(sub.points[0].x, sub.points[0].y);
                    for (let i = 1; i < sub.points.length; i++) {
                        ctx.lineTo(sub.points[i].x, sub.points[i].y);
                    }
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = shades.bevelTop;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                }
            }

            // 2. Base rock body with subtle directional light gradient
            const rockGrad = ctx.createLinearGradient(
                rock.x - rock.width * 0.4, rock.y - rock.height * 0.4,
                rock.x + rock.width * 0.4, rock.y + rock.height * 0.4
            );
            rockGrad.addColorStop(0, shades.highlight);
            rockGrad.addColorStop(0.45, shades.base);
            rockGrad.addColorStop(1, shades.shadow);

            ctx.fillStyle = rockGrad;
            ctx.beginPath();
            ctx.moveTo(rock.points[0].x, rock.points[0].y);
            
            for (let i = 1; i < rock.points.length; i++) {
                ctx.lineTo(rock.points[i].x, rock.points[i].y);
            }
            
            ctx.closePath();
            ctx.fill();

            // 3. Draw internal beveled facets / strata layers
            if (rock.facets) {
                for (let f = 0; f < rock.facets.length; f++) {
                    const facet = rock.facets[f];
                    if (facet.length < 3) continue;
                    
                    ctx.save();
                    ctx.fillStyle = (f % 2 === 0) ? shades.accent : shades.shadow;
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.moveTo(facet[0].x, facet[0].y);
                    for (let k = 1; k < facet.length; k++) {
                        ctx.lineTo(facet[k].x, facet[k].y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    
                    ctx.strokeStyle = shades.bevelTop;
                    ctx.lineWidth = 1.2;
                    ctx.globalAlpha = 0.35;
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // 4. Beveled perimeter outline with subtle top-highlight and dark bottom-edge shading
            ctx.strokeStyle = shades.bevelTop;
            ctx.lineWidth = 3.5;
            ctx.stroke();

            // Additional subtle dark contour outline for depth
            ctx.strokeStyle = shades.shadow;
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawCoralReefOverlay(ctx, creature) {
        // No screen obstruction overlay
    }
    
    shouldRenderCreature(presence) {
        return true;
    }
}
