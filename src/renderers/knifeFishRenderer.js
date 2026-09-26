import { CONFIG } from '../core/config.js';
import { drawStaminaIndicator } from './gameRenderer.js';

export class KnifeFishRenderer {
    constructor(game) {
        this.game = game;
    }

    drawKnifeFish(ctx, knifeFish, isLocalPlayer = false) {
        const segments = knifeFish.segments;
        const color = knifeFish.color;
        
        ctx.save();
        // Apply semi-transparency for knife fish
        ctx.globalAlpha = 0.7;
        
        // Draw the main body
        this.drawKnifeFishBody(ctx, knifeFish);
        
        // Draw player info on top of the knife fish
        this.drawPlayerInfo(ctx, knifeFish, isLocalPlayer);
        
        // Reset transparency
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }
    
    drawKnifeFishBody(ctx, knifeFish) {
        const segments = knifeFish.segments;
        if (!segments || segments.length < 2) return;
        
        const headSegment = segments[0];
        const headX = headSegment.x;
        const headY = headSegment.y;
        const headAngle = headSegment.angle;
        
        // Create a path for the entire fish body
        ctx.fillStyle = knifeFish.color;
        ctx.beginPath();
        
        // Parameters for eye-shaped body (scaled with KNIFEFISH_SIZE_MULTIPLIER)
        const sizeMult = (CONFIG.KNIFEFISH_SIZE_MULTIPLIER || 0.52) / 0.6;
        const bodyLength = CONFIG.SEGMENT_SIZE * 5 * sizeMult;  // Total length of the fish
        const bodyWidth = CONFIG.SEGMENT_SIZE * 1.2 * sizeMult; // Maximum width at the middle
        
        // Save context to apply rotation
        ctx.save();
        ctx.translate(headX, headY);
        ctx.rotate(headAngle);
        
        // Draw the eye-shaped body (pointed at both ends, wider in middle)
        // Start at the front tip
        ctx.moveTo(bodyLength/2, 0);
        
        // Add points to create the top curved edge
        for (let t = 0; t <= 1; t += 0.1) {
            // Parametric equation for top half of eye shape
            const x = bodyLength/2 - bodyLength * t;
            // Thicker in front, slimmer in back
            const thickness = bodyWidth/2 * Math.sin(Math.PI * t) * (t < 0.5 ? 1.2 : 0.9);
            ctx.lineTo(x, -thickness);
        }
        
        // Complete bottom curved edge
        for (let t = 1; t >= 0; t -= 0.1) {
            const x = bodyLength/2 - bodyLength * t;
            const thickness = bodyWidth/2 * Math.sin(Math.PI * t) * (t < 0.5 ? 1.2 : 0.9);
            ctx.lineTo(x, thickness);
        }
        
        ctx.closePath();
        ctx.fill();
        
        // Draw tail fin that simply rotates back and forth from the point of the start of the tail
        const tailPhase = knifeFish.fastSwimPhase || 0;
        const maxTailAngle = knifeFish.isFastSwimming ? 0.35 : 0.22;
        const tailAngle = Math.sin(tailPhase) * maxTailAngle;

        ctx.save();
        // Pivot from the point of the start of the tail (-bodyLength/2, 0)
        ctx.translate(-bodyLength / 2, 0);
        ctx.rotate(tailAngle);

        // Correctly oriented (non-inverted) caudal tail fin:
        // Connects narrow at the base where it meets the body, and spreads outward backwards into upper and lower fin lobes
        const tailLength = bodyWidth * 1.5;
        const finSpread = bodyWidth * 0.65;
        const baseHalf = bodyWidth * 0.10;

        ctx.fillStyle = knifeFish.color;
        ctx.beginPath();
        ctx.moveTo(0, -baseHalf);
        // Upper edge sweeping back and out to top fin tip
        ctx.quadraticCurveTo(-tailLength * 0.45, -finSpread * 0.65, -tailLength, -finSpread);
        // Forked / notched trailing edge curving back to bottom tip
        ctx.quadraticCurveTo(-tailLength * 0.65, 0, -tailLength, finSpread);
        // Lower edge sweeping back to bottom of narrow base
        ctx.quadraticCurveTo(-tailLength * 0.45, finSpread * 0.65, 0, baseHalf);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        
        // Characteristic undulating ventral ribbon fin along the lower edge of the body
        ctx.save();
        ctx.fillStyle = knifeFish.color;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        const finStartX = bodyLength * 0.25;
        const finEndX = -bodyLength / 2;
        ctx.moveTo(finStartX, bodyWidth * 0.15);
        for (let t = 0; t <= 1; t += 0.08) {
            const fx = finStartX + (finEndX - finStartX) * t;
            const finBase = bodyWidth * 0.48 * Math.sin(Math.PI * t);
            const finWave = Math.sin(tailPhase * 1.6 - t * Math.PI * 4) * (bodyWidth * 0.16);
            ctx.lineTo(fx, finBase + finWave);
        }
        ctx.lineTo(finEndX, bodyWidth * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Draw two eyes instead of one
        ctx.fillStyle = 'black';
        // First eye (top eye)
        ctx.beginPath();
        ctx.arc(bodyLength/3, -bodyWidth/6, bodyWidth/10, 0, Math.PI * 2);
        ctx.fill();
        // Second eye (bottom eye)
        ctx.beginPath();
        ctx.arc(bodyLength/3, bodyWidth/6, bodyWidth/10, 0, Math.PI * 2);
        ctx.fill();
        
        // Restore context to undo rotation
        ctx.restore();
    }
    
    drawPlayerInfo(ctx, knifeFish, isLocalPlayer) {
        if (!knifeFish.segments || knifeFish.segments.length === 0) return;
        const headX = knifeFish.segments[0].x;
        const headY = knifeFish.segments[0].y;
        
        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(knifeFish.name, headX, headY - CONFIG.SEGMENT_SIZE - 10);
        
        if (knifeFish.kills > 0) {
            ctx.fillStyle = 'yellow';
            ctx.fillText(`Kills: ${knifeFish.kills}`, headX, headY - CONFIG.SEGMENT_SIZE - 25);
        }
        
        if (this.game.healthSystem) {
            this.game.healthSystem.drawHealthBar(ctx, knifeFish);
        }
        
        if (isLocalPlayer) {
            drawStaminaIndicator(ctx, knifeFish, headX, headY);
        }
    }
}