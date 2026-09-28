import { CONFIG } from '../core/config.js';
import { SquidRenderer } from './squidRenderer.js';
import { DolphinRenderer } from './dolphinRenderer.js';
import { KnifeFishRenderer } from './knifeFishRenderer.js';

export function drawStaminaIndicator(ctx, creature, headX, headY, yOffset = -CONFIG.SEGMENT_SIZE - 6) {
    const stamina = creature.stamina !== undefined ? creature.stamina : (creature.staminaReady ? 1.0 : 0.0);
    const staminaX = headX;
    const staminaY = headY + yOffset;
    const radius = 6.5;

    ctx.save();
    // 1. Dark background circle
    ctx.beginPath();
    ctx.arc(staminaX, staminaY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();

    // 2. Continuous color transition from Green (1.0) -> Yellow-Green -> Yellow (0.5) -> Orange -> Red (0.0)
    let r, g, b = 25;
    if (stamina > 0.5) {
        const t = (stamina - 0.5) / 0.5; // 0 to 1
        r = Math.round(245 * (1 - t));
        g = 235;
    } else {
        const t = stamina / 0.5; // 0 to 1
        r = 245;
        g = Math.round(235 * t);
    }
    const indicatorColor = `rgb(${r}, ${g}, ${b})`;

    // 3. Radial arc fill of the circle
    ctx.beginPath();
    ctx.moveTo(staminaX, staminaY);
    ctx.arc(staminaX, staminaY, radius - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.04, stamina), false);
    ctx.closePath();
    ctx.fillStyle = indicatorColor;
    ctx.fill();

    // 4. Outer outline border
    ctx.beginPath();
    ctx.arc(staminaX, staminaY, radius, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = creature.isExhausted ? 'rgba(255, 60, 60, 0.9)' : (stamina > 0.5 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(200, 200, 200, 0.5)');
    ctx.stroke();

    // 5. Burst threshold tick mark (start of green zone)
    const burstThreshold = CONFIG.BURST_MIN_STAMINA || 0.5;
    const tickAngle = -Math.PI / 2 + Math.PI * 2 * burstThreshold;
    const inX = staminaX + Math.cos(tickAngle) * (radius - 2.5);
    const inY = staminaY + Math.sin(tickAngle) * (radius - 2.5);
    const outX = staminaX + Math.cos(tickAngle) * (radius + 1.2);
    const outY = staminaY + Math.sin(tickAngle) * (radius + 1.2);
    ctx.beginPath();
    ctx.moveTo(inX, inY);
    ctx.lineTo(outX, outY);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
}

export class GameRenderer {
    constructor(game) {
        this.game = game;
        // Pre-render the ocean background to improve performance
        this.oceanBackground = this.createOceanBackground();
        this.squidRenderer = new SquidRenderer(game); // Initialize SquidRenderer
        this.dolphinRenderer = new DolphinRenderer(game); // Initialize DolphinRenderer
        this.knifeFishRenderer = new KnifeFishRenderer(game); // Initialize KnifeFishRenderer
    }

    render(ctx, camera, playerPresences, narwhal, bubbles) {
        // Save context state
        ctx.save();
        
        // Clear entire canvas first (to fix white edges issue)
        ctx.fillStyle = CONFIG.WATER_COLOR;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        let currentScale = 1;
        // Apply camera transform with improved scale for mobile
        if (this.game.isMobile) {
            // Center of screen
            const centerX = ctx.canvas.width / 2;
            const centerY = ctx.canvas.height / 2;
            
            // Calculate appropriate scale based on screen size
            const smallerDimension = Math.min(window.innerWidth, window.innerHeight);
            let mobileScale = CONFIG.MOBILE_CAMERA_SCALE;
            
            // Further adjust scale for very small screens
            if (smallerDimension < 400) {
                mobileScale = CONFIG.MOBILE_CAMERA_SCALE * 0.8;
            }
            currentScale = mobileScale;
            
            // Apply scale transformation around center
            ctx.translate(centerX, centerY);
            ctx.scale(mobileScale, mobileScale);
            ctx.translate(-centerX, -centerY);
        }
        
        // Apply camera transform
        ctx.translate(-camera.x, -camera.y);
        
        // Draw ocean background with full scale awareness so it never cuts off
        this.drawOceanBackground(ctx, camera, currentScale);
        
        // Draw world borders
        this.drawWorldBorders(ctx);
        
        // Draw rock formations
        if (this.game.coralReefRenderer) {
            this.game.coralReefRenderer.drawCoralReefs(ctx);
        }
        
        // Draw ink clouds on the map before drawing creatures
        if (this.game.inkSystem) {
            this.game.inkSystem.drawInkClouds(ctx);
        }
        
        // Draw other players (skip local player and any dead players)
        for (const clientId in playerPresences) {
            if (clientId === this.game.room?.clientId || (narwhal && clientId === narwhal.id)) {
                continue;
            }
            const presence = playerPresences[clientId];
            if (presence && presence.isAlive !== false && (typeof presence.health !== 'number' || presence.health > 0) && presence.segments && presence.segments.length > 0) {
                this.drawCreatureByType(ctx, presence);
            }
        }
        
        // Draw local player if it exists and is alive
        if (this.game.gameActive && narwhal && narwhal.isAlive && (typeof narwhal.health !== 'number' || narwhal.health > 0)) {
            this.drawCreatureByType(ctx, narwhal, true);
        }

        // Draw the blue water overlay ON TOP OF map objects and creatures (higher z-index / layering)
        this.drawWaterOverlay(ctx, camera, currentScale);
        
        // Draw floating bubbles in the water column
        this.drawBubbles(ctx, camera, bubbles);
        
        // Restore context state
        ctx.restore();
    }

    createOceanBackground() {
        // Create an off-screen canvas for the sand ground seabed
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.WORLD_WIDTH;
        canvas.height = CONFIG.WORLD_HEIGHT;
        const ctx = canvas.getContext('2d');
        
        // 1. Fill with warm golden sand base
        ctx.fillStyle = CONFIG.SAND_COLOR || '#dfb875';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 2. Add subtle underwater sand dunes and ripple variations
        const sandVariations = CONFIG.WATER_DEPTH_COLORS || ['#d4aa60', '#e5c483', '#caa052', '#edd49b'];
        const tileSize = 220;
        
        for (let x = 0; x < CONFIG.WORLD_WIDTH; x += tileSize) {
            for (let y = 0; y < CONFIG.WORLD_HEIGHT; y += tileSize) {
                const colorIndex = Math.floor(Math.random() * sandVariations.length);
                ctx.fillStyle = sandVariations[colorIndex];
                
                // Gentle organic sand dune patches
                ctx.globalAlpha = 0.35;
                ctx.beginPath();
                
                const centerX = x + tileSize / 2;
                const centerY = y + tileSize / 2;
                const radius = (tileSize / 2) * (0.6 + Math.random() * 0.45);
                
                for (let angle = 0; angle < Math.PI * 2; angle += 0.25) {
                    const r = radius * (0.8 + Math.random() * 0.4);
                    const pointX = centerX + Math.cos(angle) * r;
                    const pointY = centerY + Math.sin(angle) * r;
                    
                    if (angle === 0) {
                        ctx.moveTo(pointX, pointY);
                    } else {
                        ctx.lineTo(pointX, pointY);
                    }
                }
                
                ctx.closePath();
                ctx.fill();
            }
        }

        // 3. Draw realistic, sparse seabed sand ripples with natural variations and transparency
        ctx.globalAlpha = 0.10;
        const rippleSpacing = 160;
        for (let y = 30; y < CONFIG.WORLD_HEIGHT; y += rippleSpacing) {
            // Random offset and varied segment spans for each ripple band
            const yOffset = (Math.sin(y * 0.04) * 45) + ((y * 13) % 40) - 20;
            const actualY = y + yOffset;
            
            ctx.beginPath();
            let started = false;
            
            for (let x = -20; x <= CONFIG.WORLD_WIDTH + 40; x += 55) {
                // Natural wavy modulation with varied frequency
                const curveY = actualY + Math.sin(x * 0.009 + y * 0.015) * 14 + Math.cos(x * 0.022) * 6;
                
                // Introduce occasional natural breaks in the ripple lines
                const breakNoise = Math.sin(x * 0.03 + y * 0.05);
                if (breakNoise < -0.65) {
                    started = false;
                    continue;
                }
                
                if (!started) {
                    ctx.moveTo(x, curveY);
                    started = true;
                } else {
                    ctx.lineTo(x, curveY);
                }
            }
            
            ctx.strokeStyle = '#9e732c'; // Soft transparent sand shadow
            ctx.lineWidth = 2.0;
            ctx.stroke();

            // Soft highlight on the crest of the ripple
            ctx.beginPath();
            started = false;
            for (let x = -20; x <= CONFIG.WORLD_WIDTH + 40; x += 55) {
                const curveY = (actualY - 2.5) + Math.sin(x * 0.009 + y * 0.015) * 14 + Math.cos(x * 0.022) * 6;
                const breakNoise = Math.sin(x * 0.03 + y * 0.05);
                if (breakNoise < -0.65) {
                    started = false;
                    continue;
                }
                if (!started) {
                    ctx.moveTo(x, curveY);
                    started = true;
                } else {
                    ctx.lineTo(x, curveY);
                }
            }
            ctx.strokeStyle = '#fff5d6'; // Soft pale sand highlight
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }

        // 4. Subtle sand grains and pebble flecks across seabed
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#b38234';
        for (let i = 0; i < 450; i++) {
            const rx = Math.random() * CONFIG.WORLD_WIDTH;
            const ry = Math.random() * CONFIG.WORLD_HEIGHT;
            const size = 1 + Math.random() * 2.0;
            ctx.beginPath();
            ctx.arc(rx, ry, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        
        return canvas;
    }

    drawWaterOverlay(ctx, camera, currentScale = 1) {
        ctx.save();
        
        // Calculate the visible world boundaries based on canvas dimensions, camera position, and scale
        const canvasW = ctx.canvas.width;
        const canvasH = ctx.canvas.height;
        const halfW = canvasW / 2;
        const halfH = canvasH / 2;

        const visibleMinX = camera.x - halfW * (1 / currentScale - 1);
        const visibleMinY = camera.y - halfH * (1 / currentScale - 1);
        const visibleMaxX = visibleMinX + canvasW / currentScale;
        const visibleMaxY = visibleMinY + canvasH / currentScale;

        const margin = 2000;
        const fillX = Math.min(visibleMinX - margin, -margin);
        const fillY = Math.min(visibleMinY - margin, -margin);
        const fillW = Math.max(visibleMaxX + margin, CONFIG.WORLD_WIDTH + margin) - fillX;
        const fillH = Math.max(visibleMaxY + margin, CONFIG.WORLD_HEIGHT + margin) - fillY;

        // 1. Rich translucent blue ocean water overlay cast directly over ground and creatures
        const waterGradient = ctx.createLinearGradient(0, 0, 0, CONFIG.WORLD_HEIGHT);
        waterGradient.addColorStop(0, 'rgba(14, 135, 235, 0.32)');
        waterGradient.addColorStop(0.5, 'rgba(10, 115, 215, 0.36)');
        waterGradient.addColorStop(1, 'rgba(6, 85, 180, 0.44)');
        
        ctx.fillStyle = waterGradient;
        ctx.fillRect(fillX, fillY, fillW, fillH);

        // 2. Realistic, gentle, sparse water caustics with varied positions and soft transparency
        const now = performance.now() * 0.0006;
        const tileSize = 280; // Significantly larger spacing -> fewer, more organic wave caustics
        const startX = Math.max(0, Math.floor(visibleMinX / tileSize) * tileSize);
        const endX = Math.min(CONFIG.WORLD_WIDTH, Math.ceil(visibleMaxX / tileSize) * tileSize + tileSize);
        const startY = Math.max(0, Math.floor(visibleMinY / tileSize) * tileSize);
        const endY = Math.min(CONFIG.WORLD_HEIGHT, Math.ceil(visibleMaxY / tileSize) * tileSize + tileSize);

        ctx.strokeStyle = 'rgba(195, 245, 255, 0.11)'; // Much softer and more transparent
        ctx.lineWidth = 2.0;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (let x = startX; x < endX; x += tileSize) {
            for (let y = startY; y < endY; y += tileSize) {
                // Pseudo-random positional variation per wave cell
                const seedX = Math.sin(x * 0.003 + y * 0.007);
                const seedY = Math.cos(x * 0.007 + y * 0.003);
                const posX = x + (seedX * 55) + 40;
                const posY = y + (seedY * 55) + 40;

                // Subtle undulation
                const off1 = Math.sin(x * 0.008 + now * 1.2) * 18 + Math.cos(y * 0.008 + now * 0.8) * 18;
                const off2 = Math.cos(x * 0.010 - now * 0.9) * 16 + Math.sin(y * 0.010 + now * 1.0) * 16;

                ctx.beginPath();
                ctx.moveTo(posX - 40 + off1, posY + 20 + off2);
                ctx.bezierCurveTo(
                    posX + 20 + off2, posY - 30 - off1,
                    posX + 80 - off1, posY + 60 + off2,
                    posX + 150 + off2, posY + 10 + off1
                );
                ctx.stroke();

                // Gentle secondary caustic shimmer accent
                ctx.fillStyle = 'rgba(150, 235, 255, 0.035)';
                ctx.beginPath();
                ctx.arc(posX + 50 + off1, posY + 20 + off2, 55, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    drawOceanBackground(ctx, camera, currentScale = 1) {
        // Calculate the visible world boundaries based on canvas dimensions, camera position, and scale
        const canvasW = ctx.canvas.width;
        const canvasH = ctx.canvas.height;
        const halfW = canvasW / 2;
        const halfH = canvasH / 2;

        const visibleMinX = camera.x - halfW * (1 / currentScale - 1);
        const visibleMinY = camera.y - halfH * (1 / currentScale - 1);
        const visibleMaxX = visibleMinX + canvasW / currentScale;
        const visibleMaxY = visibleMinY + canvasH / currentScale;

        // 1. Draw boundless deep abyss background around and beyond world borders to prevent any cutoff
        const margin = 2000;
        const fillX = Math.min(visibleMinX - margin, -margin);
        const fillY = Math.min(visibleMinY - margin, -margin);
        const fillW = Math.max(visibleMaxX + margin, CONFIG.WORLD_WIDTH + margin) - fillX;
        const fillH = Math.max(visibleMaxY + margin, CONFIG.WORLD_HEIGHT + margin) - fillY;

        ctx.fillStyle = '#061320'; // Seamless deep ocean abyss beyond map edges
        ctx.fillRect(fillX, fillY, fillW, fillH);

        // 2. Draw the entire pre-rendered ocean water background across the full playable arena
        // Drawing the full world canvas directly eliminates all slicing, viewport clamping, and edge cutoffs
        ctx.drawImage(this.oceanBackground, 0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);
    }

    drawBubbles(ctx, camera, bubbles) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        
        for (const bubble of bubbles) {
            // Only draw if in viewport
            if (this.isInViewport(bubble.x, bubble.y, bubble.size, bubble.size, camera)) {
                ctx.beginPath();
                ctx.globalAlpha = bubble.opacity;
                ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.globalAlpha = 1;
    }

    drawWorldBorders(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);
    }

    drawCreatureByType(ctx, creature, isLocalPlayer = false) {
        if (!creature || creature.isAlive === false || (typeof creature.health === 'number' && creature.health <= 0) || !creature.segments || !Array.isArray(creature.segments) || creature.segments.length === 0 || !creature.segments[0]) {
            return;
        }

        // Skip rendering if creature should be hidden
        if (this.game.coralReefSystem && !this.game.coralReefSystem.shouldRenderCreature(creature)) {
            return;
        }
        
        if (creature.type === 'narwhal') {
            this.drawNarwhal(ctx, creature, isLocalPlayer);
        } else if (creature.type === 'dolphin') {
            this.dolphinRenderer.drawDolphin(ctx, creature, isLocalPlayer);
        } else if (creature.type === 'shark') {
            this.game.sharkRenderer.drawShark(ctx, creature, isLocalPlayer);
        } else if (creature.type === 'squid') {
            this.squidRenderer.drawSquid(ctx, creature, isLocalPlayer);
        } else if (creature.type === 'knifefish') {
            this.knifeFishRenderer.drawKnifeFish(ctx, creature, isLocalPlayer);
        }
    }

    drawNarwhal(ctx, narwhal, isLocalPlayer = false) {
        const segments = narwhal.segments;
        const color = narwhal.color;
        
        // Save context state
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        
        // Start at apex of oval head dome
        const head = segments[0];
        const fwdX = Math.cos(head.angle);
        const fwdY = Math.sin(head.angle);
        const rtX = -fwdY;
        const rtY = fwdX;
        const ltX = fwdY;
        const ltY = -fwdX;

        const headRadius = (CONFIG.SEGMENT_SIZE * head.scale) / 2;
        const headDomeLen = headRadius * 1.32; // Oval dome projection
        const apexX = head.x + headDomeLen * fwdX;
        const apexY = head.y + headDomeLen * fwdY;

        const rightHeadX = head.x + headRadius * rtX;
        const rightHeadY = head.y + headRadius * rtY;
        const leftHeadX = head.x + headRadius * ltX;
        const leftHeadY = head.y + headRadius * ltY;

        ctx.moveTo(apexX, apexY);
        // Smooth oval curve transitioning from apex to right flank of head
        ctx.bezierCurveTo(
            apexX + (headRadius * 0.55) * rtX, apexY + (headRadius * 0.55) * rtY,
            rightHeadX + (headDomeLen * 0.55) * fwdX, rightHeadY + (headDomeLen * 0.55) * fwdY,
            rightHeadX, rightHeadY
        );
        
        // Flowing body contour through thicker midsection torso
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            const radius = CONFIG.SEGMENT_SIZE * segment.scale / 2;
            ctx.lineTo(segment.x + radius * Math.cos(segment.angle + Math.PI/2), 
                       segment.y + radius * Math.sin(segment.angle + Math.PI/2));
        }
        
        // Draw the tail
        const tailSegment = segments[segments.length - 1];
        const tailAngle = tailSegment.angle;
        const tailLength = CONFIG.SEGMENT_SIZE * 1;
        const finLength = CONFIG.SEGMENT_SIZE * 1.5; // outward reach of tail fins
        const finSpread = Math.PI / 8; // 22.5 degrees

        // First tail fin (right side)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle + finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle + finSpread)
        );

        // Second tail fin (left side)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle - finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle - finSpread)
        );

        // Back to base of tail for connection to body
        ctx.lineTo(
            tailSegment.x - (CONFIG.SEGMENT_SIZE * tailSegment.scale / 2) * Math.cos(tailAngle),
            tailSegment.y - (CONFIG.SEGMENT_SIZE * tailSegment.scale / 2) * Math.sin(tailAngle)
        );

        // Continue along left side of body through thicker midsection torso
        for (let i = segments.length - 1; i >= 1; i--) {
            const segment = segments[i];
            const radius = CONFIG.SEGMENT_SIZE * segment.scale / 2;

            ctx.lineTo(
                segment.x + radius * Math.cos(segment.angle - Math.PI / 2),
                segment.y + radius * Math.sin(segment.angle - Math.PI / 2)
            );
        }

        // Left flank of head
        ctx.lineTo(leftHeadX, leftHeadY);

        // Smooth oval curve completing head dome back to apex
        ctx.bezierCurveTo(
            leftHeadX + (headDomeLen * 0.55) * fwdX, leftHeadY + (headDomeLen * 0.55) * fwdY,
            apexX + (headRadius * 0.55) * ltX, apexY + (headRadius * 0.55) * ltY,
            apexX, apexY
        );

        ctx.closePath();
        ctx.fill();

        // Draw longer slanted oval pectoral fins for narwhal (slightly higher, slightly thicker, no outlines)
        if (segments.length > 2) {
            const seg1 = segments[1];
            const seg2 = segments[2];
            // Positioned slightly higher along the body (transition between segments 1 and 2)
            const finX = seg1.x * 0.45 + seg2.x * 0.55;
            const finY = seg1.y * 0.45 + seg2.y * 0.55;
            const finAngle = seg1.angle;
            const finRadius = CONFIG.SEGMENT_SIZE * (seg1.scale * 0.45 + seg2.scale * 0.55) / 2;

            const forwardX = Math.cos(finAngle);
            const forwardY = Math.sin(finAngle);
            const rightX = -forwardY;
            const rightY = forwardX;
            const leftX = forwardY;
            const leftY = -forwardX;

            const ovalLength = CONFIG.SEGMENT_SIZE * 1.38; // Elongated flipper
            const ovalWidth = CONFIG.SEGMENT_SIZE * 0.46;  // Slightly thicker profile
            const finSlant = Math.PI * 0.75; // Slanted backward away from head (~135° from forward)

            // Right slanted oval fin (no outlines)
            ctx.save();
            ctx.fillStyle = color;

            const rBaseX = finX + (finRadius * 0.72) * rightX;
            const rBaseY = finY + (finRadius * 0.72) * rightY;

            ctx.translate(rBaseX, rBaseY);
            ctx.rotate(finAngle + finSlant);
            ctx.beginPath();
            ctx.ellipse(ovalLength * 0.5, 0, ovalLength * 0.5, ovalWidth * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Left slanted oval fin (no outlines)
            ctx.save();
            ctx.fillStyle = color;

            const lBaseX = finX + (finRadius * 0.72) * leftX;
            const lBaseY = finY + (finRadius * 0.72) * leftY;

            ctx.translate(lBaseX, lBaseY);
            ctx.rotate(finAngle - finSlant);
            ctx.beginPath();
            ctx.ellipse(ovalLength * 0.5, 0, ovalLength * 0.5, ovalWidth * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        // Draw tusk and eyes emerging seamlessly from oval head
        if (segments.length > 0) {
            ctx.fillStyle = 'white';
            ctx.beginPath();
            
            // Use tusk length modifier if available
            const tuskLengthModifier = narwhal.tuskLengthModifier || 1.0;
            const tuskLength = CONFIG.TUSK_LENGTH * tuskLengthModifier;
            const tuskBaseHalfWidth = Math.max(2.5, headRadius * 0.20);
            
            const tuskTipX = apexX + tuskLength * fwdX;
            const tuskTipY = apexY + tuskLength * fwdY;
            
            ctx.moveTo(apexX + tuskBaseHalfWidth * rtX, apexY + tuskBaseHalfWidth * rtY);
            ctx.lineTo(tuskTipX, tuskTipY);
            ctx.lineTo(apexX - tuskBaseHalfWidth * rtX, apexY - tuskBaseHalfWidth * rtY);
            ctx.closePath();
            ctx.fill();
            
            // Draw eyes symmetrically on sides of oval head
            ctx.fillStyle = 'black';
            const eyeFwd = headDomeLen * 0.45;
            const eyeSide = headRadius * 0.58;
            
            // Left eye
            ctx.beginPath();
            ctx.arc(
                head.x + eyeFwd * fwdX + eyeSide * ltX,
                head.y + eyeFwd * fwdY + eyeSide * ltY,
                2.8, 0, Math.PI * 2
            );
            ctx.fill();
            
            // Right eye
            ctx.beginPath();
            ctx.arc(
                head.x + eyeFwd * fwdX + eyeSide * rtX,
                head.y + eyeFwd * fwdY + eyeSide * rtY,
                2.8, 0, Math.PI * 2
            );
            ctx.fill();
            
            // Draw player name
            if (segments && segments.length > 0) {
                const headX = segments[0].x;
                const headY = segments[0].y;
                
                ctx.font = '12px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.fillText(narwhal.name, headX, headY - CONFIG.SEGMENT_SIZE - 10);
                
                // Draw kills
                if (narwhal.kills > 0) {
                    ctx.fillStyle = 'yellow';
                    ctx.fillText(`Kills: ${narwhal.kills}`, headX, headY - CONFIG.SEGMENT_SIZE - 25);
                }
                
                // Draw health bar
                this.game.healthSystem.drawHealthBar(ctx, narwhal);
                
                // Draw stamina indicator for local player only
                if (isLocalPlayer) {
                    drawStaminaIndicator(ctx, narwhal, headX, headY);
                }
            }
        }
        
        ctx.restore();
    }
    
    drawShark(ctx, shark, isLocalPlayer = false) {
        const segments = shark.segments;
        const color = shark.color;
        
        // Save context state
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        
        // Start at the head
        const head = segments[0];
        
        // Draw shark with diamond-shaped head
        // Diamond head points
        const headLength = CONFIG.SEGMENT_SIZE * 1.5;
        const headWidth = CONFIG.SEGMENT_SIZE * 0.9;
        
        // Head points
        const headFront = {
            x: head.x + headLength * Math.cos(head.angle),
            y: head.y + headLength * Math.sin(head.angle)
        };
        
        const headRight = {
            x: head.x + headWidth * Math.cos(head.angle + Math.PI/2),
            y: head.y + headWidth * Math.sin(head.angle + Math.PI/2)
        };
        
        const headBack = {
            x: head.x - headLength * 0.5 * Math.cos(head.angle),
            y: head.y - headLength * 0.5 * Math.sin(head.angle)
        };
        
        const headLeft = {
            x: head.x + headWidth * Math.cos(head.angle - Math.PI/2),
            y: head.y + headWidth * Math.sin(head.angle - Math.PI/2)
        };
        
        // Draw diamond head
        ctx.moveTo(headFront.x, headFront.y);
        ctx.lineTo(headRight.x, headRight.y);
        ctx.lineTo(headBack.x, headBack.y);
        ctx.lineTo(headLeft.x, headLeft.y);
        ctx.closePath();
        ctx.fill();
        
        // Draw shark body
        ctx.beginPath();
        ctx.moveTo(headBack.x, headBack.y);
        
        // Draw pectoral fins - positioned around the first body segment after the head
        if (segments.length > 1) {
            const finSegment = segments[1];
            const finSize = CONFIG.SEGMENT_SIZE * 1.2;
            
            // Right fin
            const rightFinBase = {
                x: finSegment.x,
                y: finSegment.y
            };
            
            const rightFinTip = {
                x: rightFinBase.x + finSize * Math.cos(finSegment.angle + Math.PI/2),
                y: rightFinBase.y + finSize * Math.sin(finSegment.angle + Math.PI/2)
            };
            
            // Left fin
            const leftFinBase = {
                x: finSegment.x,
                y: finSegment.y
            };
            
            const leftFinTip = {
                x: leftFinBase.x + finSize * Math.cos(finSegment.angle - Math.PI/2),
                y: leftFinBase.y + finSize * Math.sin(finSegment.angle - Math.PI/2)
            };
            
            // Draw body with fins
            ctx.lineTo(rightFinBase.x, rightFinBase.y);
            ctx.lineTo(rightFinTip.x, rightFinTip.y);
            ctx.lineTo(rightFinBase.x, rightFinBase.y);
        }
        
        // Draw the rest of the body segments
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            ctx.lineTo(segment.x, segment.y);
        }
        
        // Draw the tail
        const tailSegment = segments[segments.length - 1];
        const tailAngle = tailSegment.angle;
        const tailLength = CONFIG.SEGMENT_SIZE * 1.8; // Larger tail for shark (1.8x vs 1.5x for narwhal)
        const finLength = CONFIG.SEGMENT_SIZE * 2.0; // Larger tail fin (2.0x vs 1.5x for narwhal)
        const finSpread = Math.PI / 6; // Wider angle (30 degrees vs 22.5 for narwhal)

        // First tail fin (right side)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle + finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle + finSpread)
        );

        // Second tail fin (left side)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle - finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle - finSpread)
        );

        // Back to base of tail for connection to body
        ctx.lineTo(
            tailSegment.x - (CONFIG.SEGMENT_SIZE * tailSegment.scale / 2) * Math.cos(tailAngle),
            tailSegment.y - (CONFIG.SEGMENT_SIZE * tailSegment.scale / 2) * Math.sin(tailAngle)
        );
        
        // If we have fins drawn, we need to complete the left side of the body
        if (segments.length > 1) {
            const finSegment = segments[1];
            const finSize = CONFIG.SEGMENT_SIZE * 1.2;
            
            // Left fin base
            const leftFinBase = {
                x: finSegment.x,
                y: finSegment.y
            };
            
            // Left fin tip
            const leftFinTip = {
                x: leftFinBase.x + finSize * Math.cos(finSegment.angle - Math.PI/2),
                y: leftFinBase.y + finSize * Math.sin(finSegment.angle - Math.PI/2)
            };
            
            // Draw left side moving back to head
            ctx.lineTo(leftFinBase.x, leftFinBase.y);
            ctx.lineTo(leftFinTip.x, leftFinTip.y);
            ctx.lineTo(leftFinBase.x, leftFinBase.y);
        }
        
        // Close path back to head
        ctx.lineTo(headBack.x, headBack.y);
        ctx.closePath();
        ctx.fill();
        
        // Draw shark eyes
        ctx.fillStyle = 'black';
        const eyeOffsetX = head.x + CONFIG.SEGMENT_SIZE * 0.7 * Math.cos(head.angle);
        const eyeOffsetY = head.y + CONFIG.SEGMENT_SIZE * 0.7 * Math.sin(head.angle);
        const eyeOffsetSide = CONFIG.SEGMENT_SIZE * 0.4;
        
        // Right eye
        ctx.beginPath();
        ctx.arc(
            eyeOffsetX + eyeOffsetSide * Math.cos(head.angle + Math.PI/2),
            eyeOffsetY + eyeOffsetSide * Math.sin(head.angle + Math.PI/2),
            3, 0, Math.PI * 2
        );
        ctx.fill();
        
        // Left eye
        ctx.beginPath();
        ctx.arc(
            eyeOffsetX + eyeOffsetSide * Math.cos(head.angle - Math.PI/2),
            eyeOffsetY + eyeOffsetSide * Math.sin(head.angle - Math.PI/2),
            3, 0, Math.PI * 2
        );
        ctx.fill();
        
        // Draw player name
        if (segments && segments.length > 0) {
            const headX = segments[0].x;
            const headY = segments[0].y;
            
            ctx.font = '12px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText(shark.name, headX, headY - CONFIG.SEGMENT_SIZE - 10);
            
            // Draw kills
            if (shark.kills > 0) {
                ctx.fillStyle = 'yellow';
                ctx.fillText(`Kills: ${shark.kills}`, headX, headY - CONFIG.SEGMENT_SIZE - 25);
            }
            
            // Draw health bar
            this.game.healthSystem.drawHealthBar(ctx, shark);
            
            // Draw stamina indicator for local player only
            if (isLocalPlayer) {
                drawStaminaIndicator(ctx, shark, headX, headY);
            }
        }
        
        ctx.restore();
    }
    
    isInViewport(x, y, width, height, camera) {
        let scale = 1;
        if (this.game.isMobile) {
            const smallerDimension = Math.min(window.innerWidth, window.innerHeight);
            scale = smallerDimension < 400 ? CONFIG.MOBILE_CAMERA_SCALE * 0.8 : CONFIG.MOBILE_CAMERA_SCALE;
        }
        const halfW = (this.game.canvas.width / 2);
        const halfH = (this.game.canvas.height / 2);
        const minX = camera.x - halfW * (1 / scale - 1) - 150;
        const minY = camera.y - halfH * (1 / scale - 1) - 150;
        const maxX = minX + (this.game.canvas.width / scale) + 300;
        const maxY = minY + (this.game.canvas.height / scale) + 300;
        return (
            x + width >= minX &&
            x <= maxX &&
            y + height >= minY &&
            y <= maxY
        );
    }
}