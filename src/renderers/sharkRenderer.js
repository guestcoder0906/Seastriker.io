import { CONFIG } from '../core/config.js';
import { HammerheadSharkRenderer } from './hammerheadSharkRenderer.js';
import { drawStaminaIndicator } from './gameRenderer.js';

export class SharkRenderer {
    constructor(game) {
        this.game = game;
        this.hammerheadRenderer = new HammerheadSharkRenderer(game);
    }

    drawShark(ctx, shark, isLocalPlayer = false) {
        // Check if this is a hammerhead shark
        if (shark.skinId === 'hammerhead') {
            this.hammerheadRenderer.drawHammerheadShark(ctx, shark, isLocalPlayer);
            return;
        }
        
        const segments = shark.segments;
        const color = shark.color;
        
        ctx.save();
        ctx.fillStyle = color;
        
        // ===== Draw Head (Half-Sphere Back) =====
        ctx.beginPath();
        const head = segments[0];
        const segmentSize = CONFIG.SEGMENT_SIZE * CONFIG.SHARK_SIZE_MULTIPLIER;
        const headLength = segmentSize * 1.8;  // distance from head center to front
        const headWidth = segmentSize * 1.3;   // radius for the half-sphere at the back
        
        // Compute the front point of the head.
        const headFront = {
            x: head.x + headLength * Math.cos(head.angle),
            y: head.y + headLength * Math.sin(head.angle)
        };
        
        // Compute the right and left points (for the arc).
        const headRight = {
            x: head.x + headWidth * Math.cos(head.angle + Math.PI/2),
            y: head.y + headWidth * Math.sin(head.angle + Math.PI/2)
        };
        const headLeft = {
            x: head.x + headWidth * Math.cos(head.angle - Math.PI/2),
            y: head.y + headWidth * Math.sin(head.angle - Math.PI/2)
        };
        
        // Draw the head shape:
        // - Start at the front,
        // - Draw a line to the right side,
        // - Draw an arc from right side to left side that spans the backside (from head.angle+π/2 to head.angle+3π/2),
        // - Then draw a line back to the front.
        ctx.moveTo(headFront.x, headFront.y);
        ctx.lineTo(headRight.x, headRight.y);
        ctx.arc(head.x, head.y, headWidth, head.angle + Math.PI/2, head.angle + 3 * Math.PI/2, false);
        ctx.lineTo(headFront.x, headFront.y);
        ctx.closePath();
        ctx.fill();
        
        // ===== Draw Segmented Body =====
        ctx.beginPath();
        // Start from the head center.
        ctx.moveTo(head.x, head.y);
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            const sharkRadius = segmentSize * segment.scale / 2;
            // Right side of the body (offset outward)
            ctx.lineTo(
                segment.x + sharkRadius * Math.cos(segment.angle + Math.PI/2),
                segment.y + sharkRadius * Math.sin(segment.angle + Math.PI/2)
            );
        }
        
        // ===== Draw Tail =====
        const tailSegment = segments[segments.length - 1];
        const tailAngle = tailSegment.angle;
        const tailLength = segmentSize * 1.5; // Proportional tail for shark
        const finLength = segmentSize * 1.6;    // Slightly smaller tail fin
        const finSpread = Math.PI / 6;          // 30° spread

        // Draw first tail fin (right side)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle + finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle + finSpread)
        );
        // Draw second tail fin (left side)
        ctx.lineTo(
            tailSegment.x - finLength * Math.cos(tailAngle - finSpread),
            tailSegment.y - finLength * Math.sin(tailAngle - finSpread)
        );
        // Back to base of tail
        ctx.lineTo(tailSegment.x, tailSegment.y);
        
        // ===== Draw Left Side of Body =====
        for (let i = segments.length - 1; i >= 1; i--) {
            const segment = segments[i];
            const sharkRadius = segmentSize * segment.scale / 2;
            ctx.lineTo(
                segment.x + sharkRadius * Math.cos(segment.angle - Math.PI/2),
                segment.y + sharkRadius * Math.sin(segment.angle - Math.PI/2)
            );
        }
        ctx.lineTo(head.x, head.y);
        ctx.closePath();
        ctx.fill();
        
        // ===== Draw Fins on Top (Real Shark Swept-Back Pectoral & Pelvic Fins) =====
        const finIndex = segments.length > 2 ? 2 : 1;
        const finSegment = segments[finIndex];
        const finSize = segmentSize * 0.95; // Slightly smaller shark pectoral fins
        const sharkRadius = segmentSize * finSegment.scale / 2;
        
        const forwardX = Math.cos(finSegment.angle);
        const forwardY = Math.sin(finSegment.angle);
        const rightX = -forwardY;
        const rightY = forwardX;
        const leftX = forwardY;
        const leftY = -forwardX;
        
        const tipReach = finSize * 1.15;
        const tipSweepBack = finSize * 0.85;
        const notchOut = finSize * 0.30;
        const notchBack = finSize * 0.60;
        
        // --- Right Pectoral Fin (Inversed & Swept Back Like a Real Shark) ---
        const rightBaseFrontX = finSegment.x + sharkRadius * rightX + segmentSize * 0.25 * forwardX;
        const rightBaseFrontY = finSegment.y + sharkRadius * rightY + segmentSize * 0.25 * forwardY;
        const rightBaseRearX = finSegment.x + (sharkRadius * 0.85) * rightX - segmentSize * 0.32 * forwardX;
        const rightBaseRearY = finSegment.y + (sharkRadius * 0.85) * rightY - segmentSize * 0.32 * forwardY;
        
        const rightTipX = finSegment.x + (sharkRadius + tipReach) * rightX - tipSweepBack * forwardX;
        const rightTipY = finSegment.y + (sharkRadius + tipReach) * rightY - tipSweepBack * forwardY;
        const rightLeadMidX = finSegment.x + (sharkRadius + tipReach * 0.6) * rightX - (tipSweepBack * 0.2) * forwardX;
        const rightLeadMidY = finSegment.y + (sharkRadius + tipReach * 0.6) * rightY - (tipSweepBack * 0.2) * forwardY;
        const rightNotchX = finSegment.x + (sharkRadius + notchOut) * rightX - notchBack * forwardX;
        const rightNotchY = finSegment.y + (sharkRadius + notchOut) * rightY - notchBack * forwardY;
        
        ctx.beginPath();
        ctx.moveTo(rightBaseFrontX, rightBaseFrontY);
        ctx.quadraticCurveTo(rightLeadMidX, rightLeadMidY, rightTipX, rightTipY);
        ctx.quadraticCurveTo(rightNotchX, rightNotchY, rightBaseRearX, rightBaseRearY);
        ctx.closePath();
        ctx.fill();
        
        // --- Left Pectoral Fin (Inversed & Swept Back Like a Real Shark) ---
        const leftBaseFrontX = finSegment.x + sharkRadius * leftX + segmentSize * 0.25 * forwardX;
        const leftBaseFrontY = finSegment.y + sharkRadius * leftY + segmentSize * 0.25 * forwardY;
        const leftBaseRearX = finSegment.x + (sharkRadius * 0.85) * leftX - segmentSize * 0.32 * forwardX;
        const leftBaseRearY = finSegment.y + (sharkRadius * 0.85) * leftY - segmentSize * 0.32 * forwardY;
        
        const leftTipX = finSegment.x + (sharkRadius + tipReach) * leftX - tipSweepBack * forwardX;
        const leftTipY = finSegment.y + (sharkRadius + tipReach) * leftY - tipSweepBack * forwardY;
        const leftLeadMidX = finSegment.x + (sharkRadius + tipReach * 0.6) * leftX - (tipSweepBack * 0.2) * forwardX;
        const leftLeadMidY = finSegment.y + (sharkRadius + tipReach * 0.6) * leftY - (tipSweepBack * 0.2) * forwardY;
        const leftNotchX = finSegment.x + (sharkRadius + notchOut) * leftX - notchBack * forwardX;
        const leftNotchY = finSegment.y + (sharkRadius + notchOut) * leftY - notchBack * forwardY;
        
        ctx.beginPath();
        ctx.moveTo(leftBaseFrontX, leftBaseFrontY);
        ctx.quadraticCurveTo(leftLeadMidX, leftLeadMidY, leftTipX, leftTipY);
        ctx.quadraticCurveTo(leftNotchX, leftNotchY, leftBaseRearX, leftBaseRearY);
        ctx.closePath();
        ctx.fill();
        
        // --- Pelvic Fins (Smaller swept fins towards the rear) ---
        const pelvicIndex = segments.length > 5 ? 4 : (segments.length > 3 ? 3 : null);
        if (pelvicIndex !== null) {
            const pelvicSegment = segments[pelvicIndex];
            const pRadius = segmentSize * pelvicSegment.scale / 2;
            const pForwardX = Math.cos(pelvicSegment.angle);
            const pForwardY = Math.sin(pelvicSegment.angle);
            const pRightX = -pForwardY;
            const pRightY = pForwardX;
            const pLeftX = forwardY;
            const pLeftY = -forwardX;
            const pSize = finSize * 0.38;
            
            // Right pelvic fin
            ctx.beginPath();
            ctx.moveTo(pelvicSegment.x + pRadius * pRightX, pelvicSegment.y + pRadius * pRightY);
            ctx.lineTo(
                pelvicSegment.x + (pRadius + pSize) * pRightX - (pSize * 0.8) * pForwardX,
                pelvicSegment.y + (pRadius + pSize) * pRightY - (pSize * 0.8) * pForwardY
            );
            ctx.lineTo(
                pelvicSegment.x + (pRadius * 0.8) * pRightX - (pSize * 0.7) * pForwardX,
                pelvicSegment.y + (pRadius * 0.8) * pRightY - (pSize * 0.7) * pForwardY
            );
            ctx.closePath();
            ctx.fill();
            
            // Left pelvic fin
            ctx.beginPath();
            ctx.moveTo(pelvicSegment.x + pRadius * pLeftX, pelvicSegment.y + pRadius * pLeftY);
            ctx.lineTo(
                pelvicSegment.x + (pRadius + pSize) * pLeftX - (pSize * 0.8) * pForwardX,
                pelvicSegment.y + (pRadius + pSize) * pLeftY - (pSize * 0.8) * pForwardY
            );
            ctx.lineTo(
                pelvicSegment.x + (pRadius * 0.8) * pLeftX - (pSize * 0.7) * pForwardX,
                pelvicSegment.y + (pRadius * 0.8) * pLeftY - (pSize * 0.7) * pForwardY
            );
            ctx.closePath();
            ctx.fill();
        }
        
        // --- Dorsal Fin Shadow/Contour on Back ---
        if (segments.length > 3) {
            const dSegment = segments[2];
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.beginPath();
            const dFwdX = Math.cos(dSegment.angle);
            const dFwdY = Math.sin(dSegment.angle);
            const dRtX = -dFwdY;
            const dRtY = dFwdX;
            const dLen = segmentSize * 0.65;
            const dWidth = segmentSize * 0.18;
            
            ctx.moveTo(dSegment.x + dLen * 0.4 * dFwdX, dSegment.y + dLen * 0.4 * dFwdY);
            ctx.lineTo(dSegment.x - dLen * 0.5 * dFwdX + dWidth * dRtX, dSegment.y - dLen * 0.5 * dFwdY + dWidth * dRtY);
            ctx.lineTo(dSegment.x - dLen * 0.6 * dFwdX, dSegment.y - dLen * 0.6 * dFwdY);
            ctx.lineTo(dSegment.x - dLen * 0.5 * dFwdX - dWidth * dRtX, dSegment.y - dLen * 0.5 * dFwdY - dWidth * dRtY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        
        // ===== Draw Shark Eyes =====
        ctx.fillStyle = 'black';
        const eyeOffsetX = head.x + segmentSize * 0.7 * Math.cos(head.angle);
        const eyeOffsetY = head.y + segmentSize * 0.7 * Math.sin(head.angle);
        const eyeOffsetSide = segmentSize * 0.4;
        
        // Right eye.
        ctx.beginPath();
        ctx.arc(
            eyeOffsetX + eyeOffsetSide * Math.cos(head.angle + Math.PI/2),
            eyeOffsetY + eyeOffsetSide * Math.sin(head.angle + Math.PI/2),
            3, 0, Math.PI * 2
        );
        ctx.fill();

        
        // Left eye.
        ctx.beginPath();
        ctx.arc(
            eyeOffsetX + eyeOffsetSide * Math.cos(head.angle - Math.PI/2),
            eyeOffsetY + eyeOffsetSide * Math.sin(head.angle - Math.PI/2),
            3, 0, Math.PI * 2
        );
        ctx.fill();
        
        // ===== Draw Player Info =====
        this.drawPlayerInfo(ctx, shark, isLocalPlayer);
        
        ctx.restore();
    }
    
    drawPlayerInfo(ctx, shark, isLocalPlayer) {
        if (!shark.segments || shark.segments.length === 0) return;
        const headX = shark.segments[0].x;
        const headY = shark.segments[0].y;
        
        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(shark.name, headX, headY - CONFIG.SEGMENT_SIZE - 10);
        
        if (shark.kills > 0) {
            ctx.fillStyle = 'yellow';
            ctx.fillText(`Kills: ${shark.kills}`, headX, headY - CONFIG.SEGMENT_SIZE - 25);
        }
        
        if (this.game.healthSystem) {
            this.game.healthSystem.drawHealthBar(ctx, shark);
        }
        
        if (isLocalPlayer) {
            drawStaminaIndicator(ctx, shark, headX, headY);
        }
    }
}