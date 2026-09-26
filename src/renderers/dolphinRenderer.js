import { CONFIG } from '../core/config.js';
import { drawStaminaIndicator } from './gameRenderer.js';

export class DolphinRenderer {
    constructor(game) {
        this.game = game;
    }

    drawDolphin(ctx, dolphin, isLocalPlayer = false) {
        const segments = dolphin.segments;
        if (!segments || segments.length === 0) return;

        const mainColor = dolphin.color || '#4c9ad4';
        const head = segments[0];
        const segmentSize = CONFIG.SEGMENT_SIZE;
        const headRadius = (segmentSize * (head.scale || 1.15)) / 2;

        ctx.save();

        // 1. Draw Tail Snap attack whoosh arc if snapping (wider, bigger sweep)
        if (dolphin.tailSnapState === 'snapping') {
            const tail = segments[segments.length - 1];
            const preTail = segments[Math.max(0, segments.length - 3)];
            ctx.save();
            const snapDir = dolphin.tailSnapDir || 1;
            // Sweep center angle
            const centerAngle = tail.angle + (snapDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
            const arcRadius = segmentSize * 2.7;

            // Outer cyan/water rush glow
            ctx.beginPath();
            ctx.arc(tail.x, tail.y, arcRadius, centerAngle - 1.45, centerAngle + 1.45);
            ctx.lineWidth = 9;
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.stroke();

            // Inner crisp white snap whoosh
            ctx.beginPath();
            ctx.arc(tail.x, tail.y, arcRadius * 0.88, centerAngle - 1.3, centerAngle + 1.3);
            ctx.lineWidth = 4.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.stroke();

            // Secondary wake line near the base of the flukes
            ctx.beginPath();
            ctx.arc(preTail.x, preTail.y, arcRadius * 0.58, centerAngle - 1.05, centerAngle + 1.05);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.stroke();
            ctx.restore();
        }

        // Forward and perpendicular direction vectors for the head
        const fwdX = Math.cos(head.angle);
        const fwdY = Math.sin(head.angle);
        const rtX = -fwdY;
        const rtY = fwdX;
        const ltX = fwdY;
        const ltY = -fwdX;

        // Bottlenose Dolphin Anatomy - Sleeker, thinner, and smoothly rounded (no flat front)
        const lateralRadius = headRadius * 0.88; // Sleeker, thinner head width
        const templeRight = {
            x: head.x + rtX * lateralRadius,
            y: head.y + rtY * lateralRadius
        };
        const templeLeft = {
            x: head.x + ltX * lateralRadius,
            y: head.y + ltY * lateralRadius
        };

        // Distinct rounded snout / rostrum and melon dome (longer bottlenose beak)
        const beakLength = headRadius * 1.25; // a bit longer nose
        const rostrumBaseFwd = headRadius * 0.90;
        const rostrumBaseHalfWidth = lateralRadius * 0.36; // Slender snout width
        const tipRadius = lateralRadius * 0.19; // Smooth rounded tip
        const tipDist = rostrumBaseFwd + beakLength;
        const tipCenterX = head.x + fwdX * (tipDist - tipRadius);
        const tipCenterY = head.y + fwdY * (tipDist - tipRadius);

        const beakTipLeft = {
            x: tipCenterX + ltX * tipRadius,
            y: tipCenterY + ltY * tipRadius
        };
        const beakTipFront = {
            x: tipCenterX + fwdX * tipRadius,
            y: tipCenterY + fwdY * tipRadius
        };
        const beakTipRight = {
            x: tipCenterX + rtX * tipRadius,
            y: tipCenterY + rtY * tipRadius
        };

        const rostrumBaseLeft = {
            x: head.x + fwdX * rostrumBaseFwd + ltX * rostrumBaseHalfWidth,
            y: head.y + fwdY * rostrumBaseFwd + ltY * rostrumBaseHalfWidth
        };
        const rostrumBaseRight = {
            x: head.x + fwdX * rostrumBaseFwd + rtX * rostrumBaseHalfWidth,
            y: head.y + fwdY * rostrumBaseFwd + rtY * rostrumBaseHalfWidth
        };

        // 2. Main Body Outline
        ctx.fillStyle = mainColor;
        ctx.beginPath();

        // Start at rostrumBaseRight, go along right side of beak to rounded nose tip
        ctx.moveTo(rostrumBaseRight.x, rostrumBaseRight.y);
        ctx.lineTo(beakTipRight.x, beakTipRight.y);
        // Smooth rounded nose tip (no flat front)
        ctx.quadraticCurveTo(beakTipFront.x, beakTipFront.y, beakTipLeft.x, beakTipLeft.y);
        // Left side of beak back to rostrumBaseLeft
        ctx.lineTo(rostrumBaseLeft.x, rostrumBaseLeft.y);

        // Smooth continuous convex melon curve from rostrumBaseLeft to templeLeft (rounded, NOT flat)
        ctx.bezierCurveTo(
            head.x + fwdX * (headRadius * 0.75) + ltX * (lateralRadius * 0.62),
            head.y + fwdY * (headRadius * 0.75) + ltY * (lateralRadius * 0.62),
            head.x + fwdX * (headRadius * 0.45) + ltX * (lateralRadius * 0.92),
            head.y + fwdY * (headRadius * 0.45) + ltY * (lateralRadius * 0.92),
            templeLeft.x, templeLeft.y
        );

        // Left side of body down segments to tail
        for (let i = 1; i < segments.length; i++) {
            const seg = segments[i];
            const r = (segmentSize * (seg.scale || 1.0)) / 2;
            ctx.lineTo(
                seg.x + r * Math.cos(seg.angle - Math.PI / 2),
                seg.y + r * Math.sin(seg.angle - Math.PI / 2)
            );
        }

        // Tail segment & Flukes (horizontal dolphin tail with central notch - smaller, sleek fins)
        const sizeMult = CONFIG.DOLPHIN_SIZE_MULTIPLIER || 1.15;
        const tailSeg = segments[segments.length - 1];
        const flukeSpan = segmentSize * 0.95 * sizeMult;
        const flukeBack = segmentSize * 0.70 * sizeMult;

        const flukeLeft = {
            x: tailSeg.x + flukeSpan * Math.cos(tailSeg.angle - Math.PI / 2.25) - flukeBack * Math.cos(tailSeg.angle),
            y: tailSeg.y + flukeSpan * Math.sin(tailSeg.angle - Math.PI / 2.25) - flukeBack * Math.sin(tailSeg.angle)
        };
        const flukeNotch = {
            x: tailSeg.x - (flukeBack * 0.45) * Math.cos(tailSeg.angle),
            y: tailSeg.y - (flukeBack * 0.45) * Math.sin(tailSeg.angle)
        };
        const flukeRight = {
            x: tailSeg.x + flukeSpan * Math.cos(tailSeg.angle + Math.PI / 2.25) - flukeBack * Math.cos(tailSeg.angle),
            y: tailSeg.y + flukeSpan * Math.sin(tailSeg.angle + Math.PI / 2.25) - flukeBack * Math.sin(tailSeg.angle)
        };

        // Flukes with curved trailing edges
        ctx.lineTo(flukeLeft.x, flukeLeft.y);
        ctx.quadraticCurveTo(
            tailSeg.x - (flukeBack * 0.8) * Math.cos(tailSeg.angle),
            tailSeg.y - (flukeBack * 0.8) * Math.sin(tailSeg.angle),
            flukeNotch.x, flukeNotch.y
        );
        ctx.quadraticCurveTo(
            tailSeg.x - (flukeBack * 0.8) * Math.cos(tailSeg.angle),
            tailSeg.y - (flukeBack * 0.8) * Math.sin(tailSeg.angle),
            flukeRight.x, flukeRight.y
        );

        // Right side of body from tail back to templeRight
        for (let i = segments.length - 1; i >= 1; i--) {
            const seg = segments[i];
            const r = (segmentSize * (seg.scale || 1.0)) / 2;
            ctx.lineTo(
                seg.x + r * Math.cos(seg.angle + Math.PI / 2),
                seg.y + r * Math.sin(seg.angle + Math.PI / 2)
            );
        }

        // Smooth continuous convex melon curve from templeRight to rostrumBaseRight (rounded, NOT flat)
        ctx.bezierCurveTo(
            head.x + fwdX * (headRadius * 0.45) + rtX * (lateralRadius * 0.92),
            head.y + fwdY * (headRadius * 0.45) + rtY * (lateralRadius * 0.92),
            head.x + fwdX * (headRadius * 0.75) + rtX * (lateralRadius * 0.62),
            head.y + fwdY * (headRadius * 0.75) + rtY * (lateralRadius * 0.62),
            rostrumBaseRight.x, rostrumBaseRight.y
        );

        ctx.closePath();
        ctx.fill();

        // 3. Pale creamy underbelly shading (runs from lower jaw along belly)
        ctx.save();
        ctx.fillStyle = 'rgba(242, 248, 255, 0.42)';
        ctx.beginPath();
        // Starts at rounded snout apex
        ctx.moveTo(tipCenterX, tipCenterY);
        for (let i = 0; i < segments.length - 2; i++) {
            const seg = segments[i];
            const r = (segmentSize * (seg.scale || 1.0) * 0.36) / 2;
            ctx.lineTo(
                seg.x + r * Math.cos(seg.angle + Math.PI / 2),
                seg.y + r * Math.sin(seg.angle + Math.PI / 2)
            );
        }
        for (let i = segments.length - 3; i >= 0; i--) {
            const seg = segments[i];
            const r = (segmentSize * (seg.scale || 1.0) * 0.36) / 2;
            ctx.lineTo(
                seg.x + r * Math.cos(seg.angle - Math.PI / 2),
                seg.y + r * Math.sin(seg.angle - Math.PI / 2)
            );
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 4. Bottlenose Dolphin Smile Lines (subtle mouth line along sides of beak)
        ctx.save();
        ctx.strokeStyle = 'rgba(20, 50, 80, 0.38)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        // Right smile line
        ctx.moveTo(rostrumBaseRight.x, rostrumBaseRight.y);
        ctx.quadraticCurveTo(
            head.x + fwdX * (rostrumBaseFwd + beakLength * 0.5) + rtX * (rostrumBaseHalfWidth * 0.82),
            head.y + fwdY * (rostrumBaseFwd + beakLength * 0.5) + rtY * (rostrumBaseHalfWidth * 0.82),
            beakTipRight.x, beakTipRight.y
        );
        // Left smile line
        ctx.moveTo(rostrumBaseLeft.x, rostrumBaseLeft.y);
        ctx.quadraticCurveTo(
            head.x + fwdX * (rostrumBaseFwd + beakLength * 0.5) + ltX * (rostrumBaseHalfWidth * 0.82),
            head.y + fwdY * (rostrumBaseFwd + beakLength * 0.5) + ltY * (rostrumBaseHalfWidth * 0.82),
            beakTipLeft.x, beakTipLeft.y
        );
        ctx.stroke();
        ctx.restore();

        // 5. Dolphin Pectoral Flippers (Segment 1)
        if (segments.length > 2) {
            const flipperSeg = segments[1];
            const flipperRadius = (segmentSize * flipperSeg.scale) / 2;
            const fFwdX = Math.cos(flipperSeg.angle);
            const fFwdY = Math.sin(flipperSeg.angle);
            const fRtX = -fFwdY;
            const fRtY = fFwdX;
            const fLtX = fFwdY;
            const fLtY = -fFwdX;

            const sizeMult = CONFIG.DOLPHIN_SIZE_MULTIPLIER || 1.15;
            const flipperLen = segmentSize * 0.70 * sizeMult;
            const flipperSweep = segmentSize * 0.42 * sizeMult;

            ctx.fillStyle = mainColor;

            // Right flipper
            ctx.beginPath();
            ctx.moveTo(flipperSeg.x + flipperRadius * fRtX, flipperSeg.y + flipperRadius * fRtY);
            ctx.quadraticCurveTo(
                flipperSeg.x + (flipperRadius + flipperLen * 0.55) * fRtX,
                flipperSeg.y + (flipperRadius + flipperLen * 0.55) * fRtY,
                flipperSeg.x + (flipperRadius + flipperLen) * fRtX - flipperSweep * fFwdX,
                flipperSeg.y + (flipperRadius + flipperLen) * fRtY - flipperSweep * fFwdY
            );
            ctx.lineTo(
                flipperSeg.x + (flipperRadius * 0.65) * fRtX - (flipperSweep * 0.85) * fFwdX,
                flipperSeg.y + (flipperRadius * 0.65) * fRtY - (flipperSweep * 0.85) * fFwdY
            );
            ctx.closePath();
            ctx.fill();

            // Left flipper
            ctx.beginPath();
            ctx.moveTo(flipperSeg.x + flipperRadius * fLtX, flipperSeg.y + flipperRadius * fLtY);
            ctx.quadraticCurveTo(
                flipperSeg.x + (flipperRadius + flipperLen * 0.55) * fLtX,
                flipperSeg.y + (flipperRadius + flipperLen * 0.55) * fLtY,
                flipperSeg.x + (flipperRadius + flipperLen) * fLtX - flipperSweep * fFwdX,
                flipperSeg.y + (flipperRadius + flipperLen) * fLtY - flipperSweep * fFwdY
            );
            ctx.lineTo(
                flipperSeg.x + (flipperRadius * 0.65) * fLtX - (flipperSweep * 0.85) * fFwdX,
                flipperSeg.y + (flipperRadius * 0.65) * fLtY - (flipperSweep * 0.85) * fFwdY
            );
            ctx.closePath();
            ctx.fill();
        }

        // 6. Dolphin Dorsal Fin (Falcate curved fin along mid-back)
        if (segments.length > 4) {
            const dSeg = segments[3];
            const dFwdX = Math.cos(dSeg.angle);
            const dFwdY = Math.sin(dSeg.angle);
            const dRtX = -dFwdY;
            const dRtY = dFwdX;
            const sizeMult = CONFIG.DOLPHIN_SIZE_MULTIPLIER || 1.15;
            const dLen = segmentSize * 0.52 * sizeMult;
            const dSweep = segmentSize * 0.38 * sizeMult;

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.beginPath();
            ctx.moveTo(dSeg.x + dLen * 0.45 * dFwdX, dSeg.y + dLen * 0.45 * dFwdY);
            ctx.quadraticCurveTo(
                dSeg.x + (dLen * 0.15) * dFwdX + (dLen * 0.4) * dRtX,
                dSeg.y + (dLen * 0.15) * dFwdY + (dLen * 0.4) * dRtY,
                dSeg.x - dSweep * dFwdX,
                dSeg.y - dSweep * dFwdY
            );
            ctx.lineTo(dSeg.x - (dSweep * 0.65) * dFwdX, dSeg.y - (dSweep * 0.65) * dFwdY);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 7. Expressive Dolphin Eyes & Blowhole
        const eyeOffset = lateralRadius * 0.80;
        const eyeFwd = headRadius * 0.22;

        // Right eye
        const rightEyeX = head.x + eyeFwd * fwdX + eyeOffset * rtX;
        const rightEyeY = head.y + eyeFwd * fwdY + eyeOffset * rtY;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(rightEyeX, rightEyeY, 3.0, 0, Math.PI * 2);
        ctx.fill();
        // White specular catchlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(rightEyeX + fwdX * 0.8 + rtX * 0.6, rightEyeY + fwdY * 0.8 + rtY * 0.6, 1.1, 0, Math.PI * 2);
        ctx.fill();

        // Left eye
        const leftEyeX = head.x + eyeFwd * fwdX + eyeOffset * ltX;
        const leftEyeY = head.y + eyeFwd * fwdY + eyeOffset * ltY;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(leftEyeX, leftEyeY, 3.0, 0, Math.PI * 2);
        ctx.fill();
        // White specular catchlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(leftEyeX + fwdX * 0.8 + ltX * 0.6, leftEyeY + fwdY * 0.8 + ltY * 0.6, 1.1, 0, Math.PI * 2);
        ctx.fill();

        // Blowhole (transverse crescent behind the melon dome)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.beginPath();
        ctx.ellipse(head.x - fwdX * (headRadius * 0.25), head.y - fwdY * (headRadius * 0.25), 2.0, 3.5, head.angle + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();

        // 8. Player Info (Name, Kills, Health Bar)
        if (dolphin.name) {
            ctx.font = '12px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText(dolphin.name, head.x, head.y - CONFIG.SEGMENT_SIZE - 10);
        }

        if (dolphin.kills > 0) {
            ctx.fillStyle = 'yellow';
            ctx.textAlign = 'center';
            ctx.fillText(`Kills: ${dolphin.kills}`, head.x, head.y - CONFIG.SEGMENT_SIZE - 25);
        }

        if (this.game.healthSystem) {
            this.game.healthSystem.drawHealthBar(ctx, dolphin);
        }

        // 9. Stamina Indicator
        if (isLocalPlayer) {
            drawStaminaIndicator(ctx, dolphin, head.x, head.y);
        }

        ctx.restore();
    }
}
