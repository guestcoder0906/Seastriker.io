import { CONFIG } from '../core/config.js';
import { drawStaminaIndicator } from './gameRenderer.js';

export class HammerheadSharkRenderer {
    constructor(game) {
        this.game = game;
    }

    drawHammerheadShark(ctx, shark, isLocalPlayer = false) {
        const segments = shark.segments;
        const color = shark.color || 'hsl(0, 0%, 40%)'; // Default grey color for hammerhead
        
        ctx.save();
        ctx.fillStyle = color;
        
        // ===== Draw Head (Hammerhead style) =====
        ctx.beginPath();
        const head = segments[0];
        const segmentSize = CONFIG.SEGMENT_SIZE * CONFIG.SHARK_SIZE_MULTIPLIER;
        const headLength = segmentSize * 1.2;  // slightly shorter than regular shark
        const hammerWidth = segmentSize * 2.5; // wide rectangle for hammer
        const hammerHeight = segmentSize * 0.8; // thinner height for hammer shape
        
        // Head center position
        const headCenter = {
            x: head.x,
            y: head.y
        };
        
        // Translate and rotate to handle drawing the hammerhead
        ctx.translate(headCenter.x, headCenter.y);
        ctx.rotate(head.angle);
        
        // Position the rectangle more forward relative to the center
        // Moved from center to 1/3 of headLength forward for better attachment
        ctx.fillRect(headLength/3, -hammerWidth/2, hammerHeight, hammerWidth);
        
        // Draw the main head using the same style as normal shark
        // (halfcircle + pointed front instead of oval)
        ctx.beginPath();
        
        // Calculate head dimensions
        const sharkHeadWidth = segmentSize * .8;
        const sharkHeadLength = headLength;
        
        // Draw pointed front
        ctx.moveTo(sharkHeadLength, 0); // Front tip
        ctx.lineTo(0, sharkHeadWidth); // Right corner
        ctx.arc(0, 0, sharkHeadWidth, Math.PI/2, 3*Math.PI/2, false); // Back semicircle
        ctx.lineTo(sharkHeadLength, 0); // Back to front tip
        
        ctx.fill();
        
        // Reset transformation for drawing body
        ctx.rotate(-head.angle);
        ctx.translate(-headCenter.x, -headCenter.y);
        
        // ===== Draw Segmented Body =====
        ctx.beginPath();
        // Start from the head center
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
        const tailLength = segmentSize * 1.5; 
        const finLength = segmentSize * 1.6;    
        const finSpread = Math.PI / 6;          

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
        
        // --- Pelvic Fins ---
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
        
        // ===== Draw Shark Eyes =====
        ctx.fillStyle = 'black';
        
        // Eyes at the ends of the hammerhead
        ctx.save();
        ctx.translate(headCenter.x, headCenter.y);
        ctx.rotate(head.angle);
        
        // Left eye - moved to the far end of the hammer width
        ctx.beginPath();
        ctx.arc(headLength/2, -hammerWidth/2 + 5, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Right eye - moved to the far end of the hammer width
        ctx.beginPath();
        ctx.arc(headLength/2, hammerWidth/2 - 5, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
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