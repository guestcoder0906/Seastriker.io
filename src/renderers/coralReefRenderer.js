export class CoralReefRenderer {
    constructor(game) {
        this.game = game;
    }
    
    drawCoralReefs(ctx) {
        if (!this.game.coralReefSystem) return;
        
        this.game.coralReefSystem.drawCoralReefs(ctx);
    }
    
    drawCoralReefOverlay(ctx, creature) {
        if (!creature.isHiddenInReef) return;
        
        ctx.save();
        
        // Make overlay more visible with stronger color
        ctx.fillStyle = 'rgba(0, 150, 150, 0.4)'; // Made slightly more opaque
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // Increased wave visibility
        ctx.lineWidth = 4; // Thicker lines
        
        for (let i = 0; i < 5; i++) {
            const y = i * ctx.canvas.height / 5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            
            for (let x = 0; x < ctx.canvas.width; x += 50) {
                const amplitude = 20;
                const waveY = y + Math.sin(x / 100 + performance.now() / 1000) * amplitude;
                ctx.lineTo(x, waveY);
            }
            
            ctx.stroke();
        }
        
        ctx.font = 'bold 24px Arial'; // Larger text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // More visible text
        ctx.textAlign = 'center';
        ctx.fillText('HIDDEN IN CORAL', ctx.canvas.width / 2, 50);
        
        ctx.restore();
    }
}