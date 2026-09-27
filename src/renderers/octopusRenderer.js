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

    drawTentacles(ctx, squid) {
        const tentacles = squid.tentacles;
        if (!tentacles || tentacles.length === 0) return;

        ctx.save();
        ctx.strokeStyle = squid.color; // Tentacle color same as body
        ctx.lineWidth = CONFIG.TENTACLE_THICKNESS; // Tentacle thickness
        ctx.lineCap = 'round'; // Rounded tentacle endings

        tentacles.forEach(tentacleSegments => {
            ctx.beginPath();
            ctx.moveTo(tentacleSegments[0].x, tentacleSegments[0].y);
            for (let i = 1; i < tentacleSegments.length; i++) {
                ctx.lineTo(tentacleSegments[i].x, tentacleSegments[i].y);
            }
            ctx.stroke();
        });

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