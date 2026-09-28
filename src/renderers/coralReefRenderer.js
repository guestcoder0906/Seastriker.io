export class CoralReefRenderer {
    constructor(game) {
        this.game = game;
    }
    
    drawCoralReefs(ctx) {
        if (!this.game.coralReefSystem) return;
        this.game.coralReefSystem.drawCoralReefs(ctx);
    }

    drawRocks(ctx) {
        if (!this.game.coralReefSystem) return;
        this.game.coralReefSystem.drawRocks(ctx);
    }
    
    drawCoralReefOverlay(ctx, creature) {
        // Overlay removed to avoid screen obstruction
    }
}