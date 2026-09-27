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
            
            // Draw ink ability indicator (blue/gray)
            const inkX = headX + 8;
            const inkY = headY - CONFIG.SEGMENT_SIZE * 2 - 2;
            ctx.beginPath();
            ctx.arc(inkX, inkY, staminaRadius, 0, Math.PI * 2);
            ctx.fillStyle = squid.inkReady ? 'blue' : 'gray';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }
}