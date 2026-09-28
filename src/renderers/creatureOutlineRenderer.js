import { CONFIG } from '../core/config.js';

export class CreatureOutlineRenderer {
    constructor(game) {
        this.game = game;
    }
    
    drawCreatureOutline(ctx, creature, outlineColor = 'rgba(255, 255, 255, 0.5)', outlineWidth = 3) {
        if (!creature || !creature.segments || creature.segments.length === 0) return;
        
        ctx.save();
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = outlineWidth;
        
        // Draw outline based on creature type
        if (creature.type === 'narwhal') {
            this.drawNarwhalOutline(ctx, creature);
        } else if (creature.type === 'shark') {
            this.drawSharkOutline(ctx, creature);
        } else if (creature.type === 'squid') {
            this.drawSquidOutline(ctx, creature);
        } else if (creature.type === 'knifefish') {
            this.drawKnifeFishOutline(ctx, creature);
        }
        
        ctx.restore();
    }
    
    drawNarwhalOutline(ctx, creature) {
        const segments = creature.segments;
        if (!segments || segments.length === 0) return;
        
        const head = segments[0];
        const fwdX = Math.cos(head.angle);
        const fwdY = Math.sin(head.angle);
        const rtX = -fwdY;
        const rtY = fwdX;
        const ltX = fwdY;
        const ltY = -fwdX;

        const headRadius = (CONFIG.SEGMENT_SIZE * head.scale) / 2;
        const headDomeLen = headRadius * 1.32;
        const apexX = head.x + headDomeLen * fwdX;
        const apexY = head.y + headDomeLen * fwdY;

        const rightHeadX = head.x + headRadius * rtX;
        const rightHeadY = head.y + headRadius * rtY;
        const leftHeadX = head.x + headRadius * ltX;
        const leftHeadY = head.y + headRadius * ltY;

        ctx.beginPath();
        ctx.moveTo(apexX, apexY);
        // Smooth oval curve transitioning from apex to right flank of head
        ctx.bezierCurveTo(
            apexX + (headRadius * 0.55) * rtX, apexY + (headRadius * 0.55) * rtY,
            rightHeadX + (headDomeLen * 0.55) * fwdX, rightHeadY + (headDomeLen * 0.55) * fwdY,
            rightHeadX, rightHeadY
        );
        
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            const radius = CONFIG.SEGMENT_SIZE * segment.scale / 2;
            ctx.lineTo(segment.x + radius * Math.cos(segment.angle + Math.PI/2), 
                       segment.y + radius * Math.sin(segment.angle + Math.PI/2));
        }
        
        for (let i = segments.length - 1; i >= 1; i--) {
            const segment = segments[i];
            const radius = CONFIG.SEGMENT_SIZE * segment.scale / 2;
            ctx.lineTo(segment.x + radius * Math.cos(segment.angle - Math.PI/2), 
                       segment.y + radius * Math.sin(segment.angle - Math.PI/2));
        }

        ctx.lineTo(leftHeadX, leftHeadY);

        // Smooth oval curve completing head dome back to apex
        ctx.bezierCurveTo(
            leftHeadX + (headDomeLen * 0.55) * fwdX, leftHeadY + (headDomeLen * 0.55) * fwdY,
            apexX + (headRadius * 0.55) * ltX, apexY + (headRadius * 0.55) * ltY,
            apexX, apexY
        );
        
        ctx.closePath();
        ctx.stroke();
    }
    
    drawSharkOutline(ctx, creature) {
        const segments = creature.segments;
        
        ctx.beginPath();
        ctx.moveTo(segments[0].x, segments[0].y);
        
        // Draw the head
        ctx.lineTo(
            segments[0].x + CONFIG.SEGMENT_SIZE * 1.5 * Math.cos(segments[0].angle), 
            segments[0].y + CONFIG.SEGMENT_SIZE * 1.5 * Math.sin(segments[0].angle)
        );
        
        // Draw body segments
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            ctx.lineTo(segment.x, segment.y);
        }
        
        // Draw left and right fins
        const finSegment = segments[1];
        const finSize = CONFIG.SEGMENT_SIZE * 1.2;
        ctx.lineTo(
            finSegment.x + finSize * Math.cos(segments[0].angle - Math.PI/2),
            finSegment.y + finSize * Math.sin(segments[0].angle - Math.PI/2)
        );
        ctx.lineTo(
            finSegment.x + finSize * Math.cos(segments[0].angle + Math.PI/2),
            finSegment.y + finSize * Math.sin(segments[0].angle + Math.PI/2)
        );
        
        // Draw tail
        const tailSegment = segments[segments.length - 1];
        ctx.lineTo(tailSegment.x, tailSegment.y);
        
        // Close the path
        ctx.lineTo(segments[0].x, segments[0].y);
        ctx.stroke();
    }
    
    drawSquidOutline(ctx, creature) {
        const segments = creature.segments;
        
        ctx.beginPath();
        ctx.moveTo(segments[0].x, segments[0].y);
        
        // Draw head
        ctx.lineTo(
            segments[0].x + CONFIG.SEGMENT_SIZE * 1.8 * Math.cos(segments[0].angle), 
            segments[0].y + CONFIG.SEGMENT_SIZE * 1.8 * Math.sin(segments[0].angle)
        );
        
        // Draw body segments
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i];
            ctx.lineTo(segment.x, segment.y);
        }
        
        // Draw tentacles safely
        if (creature.tentacles && Array.isArray(creature.tentacles)) {
            for (let i = 0; i < creature.tentacles.length; i++) {
                const tentacle = creature.tentacles[i];
                if (!tentacle || !tentacle.length || !tentacle[0]) continue;
                ctx.moveTo(tentacle[0].x, tentacle[0].y);
                for (let j = 1; j < tentacle.length; j++) {
                    if (tentacle[j]) {
                        ctx.lineTo(tentacle[j].x, tentacle[j].y);
                    }
                }
            }
        }
        
        ctx.stroke();
    }
    
    drawKnifeFishOutline(ctx, creature) {
        const segments = creature.segments;
        
        ctx.beginPath();
        ctx.moveTo(segments[0].x, segments[0].y);
        
        // Draw body segments
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            ctx.lineTo(segment.x, segment.y);
        }
        
        ctx.stroke();
    }
}