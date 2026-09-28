import { CONFIG } from '../core/config.js';
import { OctopusRenderer } from './octopusRenderer.js';
import { drawStaminaIndicator } from './gameRenderer.js';

export class SquidRenderer {
    constructor(game) {
        this.game = game;
        this.octopusRenderer = new OctopusRenderer(game);
    }

    drawSquid(ctx, squid, isLocalPlayer = false) {
        // Check if squid is using octopus skin
        if (squid.skinId === 'octopus') {
            this.octopusRenderer.drawOctopus(ctx, squid, isLocalPlayer);
            return;
        }
        
        this.drawSquidBody(ctx, squid);
        this.drawSquidEyes(ctx, squid);
        this.drawTentacles(ctx, squid);
        this.drawPlayerInfo(ctx, squid, isLocalPlayer);
    }

    drawSquidBody(ctx, squid) {
        const segments = squid.segments;
        const color = squid.color;

        ctx.save();
        ctx.fillStyle = color;

        // Draw Head (Rectangle)
        const head = segments[0];
        ctx.beginPath();

        // Rectangle dimensions
        const headWidth = CONFIG.SEGMENT_SIZE * head.scale * 1.0;
        const headHeight = CONFIG.SEGMENT_SIZE * head.scale * 1.5;
        
        // Translate and rotate to match swimming direction
        ctx.translate(head.x, head.y);
        ctx.rotate(head.angle + Math.PI/2); // Rotate 90 degrees to correct orientation
        
        // Draw the rectangle
        ctx.rect(-headWidth / 2, -headHeight / 2, headWidth, headHeight);
        ctx.fill();
        
        // Draw the diamond on top of rectangle (keeping this part since you only want to remove the side part)
        const diamondSize = CONFIG.SEGMENT_SIZE * head.scale * 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -headHeight / 2 - diamondSize * 0.7);
        ctx.lineTo(diamondSize / 2, -headHeight / 2 - diamondSize * 0.2);
        ctx.lineTo(0, -headHeight / 2 + diamondSize * 0.3);
        ctx.lineTo(-diamondSize / 2, -headHeight / 2 - diamondSize * 0.2);
        ctx.closePath();
        ctx.fill();
        
        ctx.rotate(-(head.angle + Math.PI/2));
        ctx.translate(-head.x, -head.y);

        ctx.restore();
    }

    drawSquidEyes(ctx, squid) {
        const segments = squid.segments;
        const headSegment = segments[0];
        if (!headSegment) return;

        ctx.save();
        ctx.fillStyle = 'black'; // Eye color

        const eyeSize = 3; // Eye size
        const headWidth = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.5;
        const headHeight = CONFIG.SEGMENT_SIZE * headSegment.scale * 2;
        
        // Position eyes on the left and right sides of the rectangular head near the bottom
        // Translate and rotate to match head orientation
        ctx.translate(headSegment.x, headSegment.y);
        ctx.rotate(headSegment.angle + Math.PI/2); // Added PI/2 to match the head rotation fix
        
        // Draw eyes as circles at the bottom corners - positioned lower
        ctx.beginPath();
        ctx.arc(headWidth * 0.4, headHeight * 0.3, eyeSize, 0, Math.PI * 2); // Right eye
        ctx.fill();

        ctx.beginPath();
        ctx.arc(-headWidth * 0.4, headHeight * 0.3, eyeSize, 0, Math.PI * 2); // Left eye
        ctx.fill();
        
        ctx.rotate(-(headSegment.angle + Math.PI/2));
        ctx.translate(-headSegment.x, -headSegment.y);

        ctx.restore();
    }

    ensureTentacles(squid) {
        if (!squid.segments || !squid.segments[0]) return null;
        const head = squid.segments[0];
        const numTentacles = 4;
        const numSegments = 5;
        const headScale = head.scale || 1.33;
        const headWidth = CONFIG.SEGMENT_SIZE * headScale * 1.0;
        const headHeight = CONFIG.SEGMENT_SIZE * headScale * 1.5;
        const tentacleLength = CONFIG.TENTACLE_LENGTH * 1.85;

        // Base anchor at rear edge of rectangular head
        const backX = head.x - Math.cos(head.angle) * (headHeight * 0.45);
        const backY = head.y - Math.sin(head.angle) * (headHeight * 0.45);
        const perpX = Math.cos(head.angle + Math.PI / 2);
        const perpY = Math.sin(head.angle + Math.PI / 2);

        const time = performance.now() * 0.001;
        const isDashing = !!squid.isDashing;
        const waveSpeed = isDashing ? 6.5 : 3.8;
        const waveAmp = isDashing ? 0.2 : 0.35;
        const segmentDist = tentacleLength / (numSegments - 1);

        if (!squid.tentacles || !Array.isArray(squid.tentacles) || squid.tentacles.length !== numTentacles) {
            squid.tentacles = [];
        }

        for (let t = 0; t < numTentacles; t++) {
            const fraction = numTentacles > 1 ? t / (numTentacles - 1) : 0.5;
            const spread = (fraction - 0.5) * headWidth * 0.82;
            const startX = backX + perpX * spread;
            const startY = backY + perpY * spread;
            const tentaclePhase = t * 0.78;

            if (!squid.tentacles[t] || !Array.isArray(squid.tentacles[t]) || squid.tentacles[t].length !== numSegments) {
                squid.tentacles[t] = [];
                for (let s = 0; s < numSegments; s++) {
                    squid.tentacles[t].push({
                        x: startX - Math.cos(head.angle) * (s * segmentDist),
                        y: startY - Math.sin(head.angle) * (s * segmentDist),
                        angle: head.angle + Math.PI
                    });
                }
            }

            const tSegs = squid.tentacles[t];
            tSegs[0].x = startX;
            tSegs[0].y = startY;
            tSegs[0].angle = head.angle + Math.PI;

            for (let s = 1; s < numSegments; s++) {
                const prev = tSegs[s - 1];
                const cur = tSegs[s];
                const wave = Math.sin(time * waveSpeed - s * 0.85 + tentaclePhase) * waveAmp;
                const targetAngle = head.angle + Math.PI + wave;

                const targetX = prev.x + Math.cos(targetAngle) * segmentDist;
                const targetY = prev.y + Math.sin(targetAngle) * segmentDist;

                if (isNaN(cur.x) || isNaN(cur.y)) {
                    cur.x = targetX;
                    cur.y = targetY;
                } else {
                    cur.x += (targetX - cur.x) * 0.48;
                    cur.y += (targetY - cur.y) * 0.48;
                }
                cur.angle = targetAngle;
            }
        }

        return squid.tentacles;
    }

    drawTentacles(ctx, squid) {
        let tentacles = squid.tentacles;
        if (!tentacles || !Array.isArray(tentacles) || tentacles.length === 0 || !tentacles[0] || !tentacles[0][0] || isNaN(tentacles[0][0].x)) {
            tentacles = this.ensureTentacles(squid);
        } else {
            // Continuously drive wave kinematics for non-local creatures (AI & peers)
            if (!squid.isLocalPlayer && squid.id !== this.game?.room?.clientId) {
                tentacles = this.ensureTentacles(squid);
            }
        }
        if (!tentacles || tentacles.length === 0) return;

        ctx.save();
        ctx.strokeStyle = squid.color || '#ec4899';
        ctx.lineWidth = CONFIG.TENTACLE_THICKNESS || 3.5;
        ctx.lineCap = 'round';

        for (let t = 0; t < tentacles.length; t++) {
            const tentacleSegments = tentacles[t];
            if (!tentacleSegments || tentacleSegments.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(tentacleSegments[0].x, tentacleSegments[0].y);
            for (let i = 1; i < tentacleSegments.length; i++) {
                const seg = tentacleSegments[i];
                if (seg && !isNaN(seg.x) && !isNaN(seg.y)) {
                    ctx.lineTo(seg.x, seg.y);
                }
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    drawPlayerInfo(ctx, squid, isLocalPlayer = false) {
        if (!squid.segments || squid.segments.length === 0) return;
        const headX = squid.segments[0].x;
        const headY = squid.segments[0].y;

        ctx.font = '10px Arial'; // Smaller font for squid names
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(squid.name, headX, headY - CONFIG.SEGMENT_SIZE * 2 - 5); // Adjust name position for taller head

        if (squid.kills > 0) {
            ctx.fillStyle = 'yellow';
            ctx.fillText(`Kills: ${squid.kills}`, headX, headY - CONFIG.SEGMENT_SIZE * 2 - 15); // Adjust kills position
        }

        if (this.game.healthSystem) {
            this.game.healthSystem.drawHealthBar(ctx, squid);
        }

        if (isLocalPlayer) {
            // Draw stamina indicator (gradual green to red)
            drawStaminaIndicator(ctx, squid, headX - 8, headY, -CONFIG.SEGMENT_SIZE * 2 - 2);
            const staminaRadius = 5;
            
            // Draw ink ability indicator (blue/gray with recharge progress)
            const inkX = headX + 8;
            const inkY = headY - CONFIG.SEGMENT_SIZE * 2 - 2;

            // Background circle (gray)
            ctx.beginPath();
            ctx.arc(inkX, inkY, staminaRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'gray';
            ctx.fill();

            if (squid.inkReady) {
                // Fully ready: full blue
                ctx.beginPath();
                ctx.arc(inkX, inkY, staminaRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#1e90ff';
                ctx.fill();
            } else {
                // Regenerating: show filling radial arc as cooldown progresses
                const maxCooldown = (CONFIG.SQUID_INK_COOLDOWN || 7000) / (squid.inkCooldownModifier || 1.0);
                const remaining = Math.max(0, squid.inkCooldown || 0);
                const progress = maxCooldown > 0 ? Math.max(0, Math.min(1.0, 1.0 - remaining / maxCooldown)) : 0;
                
                if (progress > 0) {
                    ctx.beginPath();
                    ctx.moveTo(inkX, inkY);
                    ctx.arc(inkX, inkY, staminaRadius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
                    ctx.closePath();
                    ctx.fillStyle = '#1e90ff';
                    ctx.fill();
                }
            }

            ctx.strokeStyle = 'white';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(inkX, inkY, staminaRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}