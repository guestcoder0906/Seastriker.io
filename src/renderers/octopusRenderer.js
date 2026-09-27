import { CONFIG } from '../core/config.js';
import { drawStaminaIndicator } from './gameRenderer.js';

export class OctopusRenderer {
    constructor(game) {
        this.game = game;
    }

    drawOctopus(ctx, squid, isLocalPlayer = false) {
        // Apply camouflage effect if active and the viewer is not a KnifeFish
        const localPlayerIsKnifeFish = this.game.creature && 
                                      this.game.creature.type === 'knifefish' && 
                                      this.game.creature.canSeeCamouflaged;
                                      
        // Only apply camouflage transparency if the viewer isn't a KnifeFish
        if (squid.isCamouflaged && !localPlayerIsKnifeFish) {
            ctx.globalAlpha = 0.1; // 90% transparency when camouflaged
        }
        
        this.drawOctopusBody(ctx, squid);
        this.drawOctopusEyes(ctx, squid);
        this.drawTentacles(ctx, squid);
        this.drawPlayerInfo(ctx, squid, isLocalPlayer);
        
        // Reset transparency
        if (squid.isCamouflaged && !localPlayerIsKnifeFish) {
            ctx.globalAlpha = 1.0;
        }
    }

    drawOctopusBody(ctx, squid) {
        const segments = squid.segments;
        const color = squid.color;

        ctx.save();
        ctx.fillStyle = color;

        // Draw a rectangular body with oval head shape on top
        const head = segments[0];
        ctx.beginPath();
        
        // Keep the squid's original rectangle body
        const headWidth = CONFIG.SEGMENT_SIZE * head.scale * 1.0;
        const headHeight = CONFIG.SEGMENT_SIZE * head.scale * 1.5;
        
        // Translate and rotate to match swimming direction
        ctx.translate(head.x, head.y);
        ctx.rotate(head.angle + Math.PI/2); // Rotate to correct orientation
        
        // Draw the rectangle body
        ctx.rect(-headWidth / 2, -headHeight / 2, headWidth, headHeight);
        ctx.fill();
        
        // Draw taller oval instead of diamond on top - moved slightly lower
        ctx.beginPath();
        ctx.ellipse(0, -headHeight / 2 + headWidth * 0.1, headWidth * 0.6, headWidth * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.rotate(-(head.angle + Math.PI/2));
        ctx.translate(-head.x, -head.y);

        ctx.restore();
    }

    drawOctopusEyes(ctx, squid) {
        const segments = squid.segments;
        const headSegment = segments[0];
        if (!headSegment) return;

        ctx.save();
        ctx.fillStyle = 'black'; // Eye color

        const eyeSize = 4; // Slightly larger eyes
        const headWidth = CONFIG.SEGMENT_SIZE * headSegment.scale * 1.0;
        
        // Position eyes on the oval head
        ctx.translate(headSegment.x, headSegment.y);
        ctx.rotate(headSegment.angle + Math.PI/2);
        
        // Draw eyes higher up on the oval
        ctx.beginPath();
        ctx.arc(headWidth * 0.4, -headWidth * 0.2, eyeSize, 0, Math.PI * 2); // Right eye
        ctx.fill();

        ctx.beginPath();
        ctx.arc(-headWidth * 0.4, -headWidth * 0.2, eyeSize, 0, Math.PI * 2); // Left eye
        ctx.fill();
        
        ctx.rotate(-(headSegment.angle + Math.PI/2));
        ctx.translate(-headSegment.x, -headSegment.y);

        ctx.restore();
    }

    ensureTentacles(squid) {
        if (!squid.segments || !squid.segments[0]) return null;
        const head = squid.segments[0];
        const numTentacles = 8;
        const numSegments = 5;
        const headScale = head.scale || 1.45;
        const headWidth = CONFIG.SEGMENT_SIZE * headScale * 1.0;
        const headHeight = CONFIG.SEGMENT_SIZE * headScale * 1.5;
        const tentacleLength = CONFIG.TENTACLE_LENGTH * 2.1;

        // Base anchor at rear edge of rectangular mantle
        const backX = head.x - Math.cos(head.angle) * (headHeight * 0.45);
        const backY = head.y - Math.sin(head.angle) * (headHeight * 0.45);
        const perpX = Math.cos(head.angle + Math.PI / 2);
        const perpY = Math.sin(head.angle + Math.PI / 2);

        const time = performance.now() * 0.001;
        const isDashing = !!squid.isDashing;
        const waveSpeed = isDashing ? 11.5 : 6.8;
        const waveAmp = isDashing ? 0.22 : 0.38;
        const segmentDist = tentacleLength / (numSegments - 1);

        if (!squid.tentacles || !Array.isArray(squid.tentacles) || squid.tentacles.length !== numTentacles) {
            squid.tentacles = [];
        }

        for (let t = 0; t < numTentacles; t++) {
            const fraction = numTentacles > 1 ? t / (numTentacles - 1) : 0.5;
            const spread = (fraction - 0.5) * headWidth * 0.88;
            const startX = backX + perpX * spread;
            const startY = backY + perpY * spread;
            const tentaclePhase = t * 0.65;

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
                const wave = Math.sin(time * waveSpeed - s * 0.82 + tentaclePhase) * waveAmp;
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

    drawPlayerInfo(ctx, squid, isLocalPlayer) {
        if (!squid.segments || squid.segments.length === 0) return;
        const headX = squid.segments[0].x;
        const headY = squid.segments[0].y;

        ctx.font = '10px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(squid.name, headX, headY - CONFIG.SEGMENT_SIZE * 2 - 5);

        if (squid.kills > 0) {
            ctx.fillStyle = 'yellow';
            ctx.fillText(`Kills: ${squid.kills}`, headX, headY - CONFIG.SEGMENT_SIZE * 2 - 15);
        }

        if (this.game.healthSystem) {
            this.game.healthSystem.drawHealthBar(ctx, squid);
        }

        if (isLocalPlayer) {
            // Draw stamina indicator (gradual green to red)
            drawStaminaIndicator(ctx, squid, headX - 8, headY, -CONFIG.SEGMENT_SIZE * 2 - 2);
            const staminaRadius = 5;
            
            // Draw camouflage ability indicator (green/gray)
            const camoX = headX + 8;
            const camoY = headY - CONFIG.SEGMENT_SIZE * 2 - 2;
            ctx.beginPath();
            ctx.arc(camoX, camoY, staminaRadius, 0, Math.PI * 2);
            ctx.fillStyle = squid.camouflageReady ? 'green' : 'gray';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }
}