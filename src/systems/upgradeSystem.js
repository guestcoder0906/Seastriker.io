import { CONFIG } from '../core/config.js';

export class UpgradeSystem {
    constructor(game) {
        this.game = game;
        this.upgrades = {};
        // Keep track of upgrade notifications
        this.notifications = [];
    }
    
    checkUpgrades(narwhal) {
        // Upgrades removed per user request
        return false;
    }
    
    applyUpgrade(narwhal, upgradeKey) {
        // Upgrades removed per user request
    }
    
    transferUpgrades(fromNarwhal, toNarwhal) {
        // Upgrades removed per user request
    }
    
    createNotification(text, narwhal) {
        let notificationText = text;
        if (narwhal.type === 'shark') {
            if (text === 'Tusk length increased!') {
                notificationText = 'Bite strength increased!';
            } else if (text === 'Tusk length maximized!') {
                notificationText = 'Bite strength maximized!';
            }
        }
        const notification = {
            text: notificationText,
            x: narwhal.segments[0].x,
            y: narwhal.segments[0].y - 70,
            alpha: 1,
            life: 120 // 2 seconds at 60fps
        };
        
        this.notifications.push(notification);
    }
    
    updateNotifications() {
        // Update all notification positions and transparency
        for (let i = this.notifications.length - 1; i >= 0; i--) {
            const notification = this.notifications[i];
            
            // Float upward
            notification.y -= 0.5;
            
            // Fade out
            notification.alpha -= 0.01;
            notification.life--;
            
            // Remove if expired
            if (notification.life <= 0 || notification.alpha <= 0) {
                this.notifications.splice(i, 1);
            }
        }
    }
    
    drawNotifications(ctx) {
        ctx.save();
        
        this.notifications.forEach(notification => {
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = `rgba(255, 255, 0, ${notification.alpha})`;
            ctx.strokeStyle = `rgba(0, 0, 0, ${notification.alpha})`;
            ctx.lineWidth = 3;
            
            // Draw text with outline
            ctx.strokeText(notification.text, notification.x, notification.y);
            ctx.fillText(notification.text, notification.x, notification.y);
        });
        
        ctx.restore();
    }
}