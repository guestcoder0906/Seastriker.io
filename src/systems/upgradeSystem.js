export class UpgradeSystem {
    constructor(game) {
        this.game = game;
        this.upgrades = {};
        this.notifications = [];
    }
    
    checkUpgrades(creature) {
        // Upgrades removed per user request
        return false;
    }
    
    applyUpgrade(creature, upgradeKey) {
        // Upgrades removed per user request
    }
    
    transferUpgrades(fromCreature, toCreature) {
        // Upgrades removed per user request
    }
    
    createNotification(text, creature) {
        // Upgrade notifications removed
    }
    
    updateNotifications() {
        if (this.notifications.length > 0) {
            this.notifications = [];
        }
    }
    
    drawNotifications(ctx) {
        // Upgrade notifications removed
    }
}
