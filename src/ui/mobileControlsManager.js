import { CONFIG } from '../core/config.js';

export class MobileControlsManager {
    constructor(game) {
        this.game = game;
        this.setupButtons();
    }
    
    setupButtons() {
        this.inkButton = document.getElementById('ink-button');
        this.camoButton = document.getElementById('camo-button');
        
        // Hide buttons initially
        if (this.inkButton) this.inkButton.style.display = 'none';
        if (this.camoButton) this.camoButton.style.display = 'none';
        
        // Setup event listeners if buttons exist
        if (this.inkButton) {
            this.inkButton.addEventListener('touchstart', (e) => {
                if (this.game.creature && 
                    this.game.creature.type === 'squid' && 
                    this.game.creature.skinId !== 'octopus' &&
                    this.game.inkSystem) {
                    this.game.inkSystem.tryActivateInk();
                    e.preventDefault();
                }
            });
        }
        
        if (this.camoButton) {
            this.camoButton.addEventListener('touchstart', (e) => {
                if (this.game.creature && 
                    this.game.creature.type === 'squid' && 
                    this.game.creature.skinId === 'octopus' &&
                    this.game.octopusAbilities) {
                    this.game.octopusAbilities.activateCamouflage(this.game.creature);
                    if (this.game.room) {
                        this.game.room.updatePresence({
                            isCamouflaged: true,
                            camouflageReady: false,
                            camouflageActiveTimer: CONFIG.OCTOPUS_CAMOUFLAGE_DURATION,
                            camouflageTimer: 0
                        });
                    }
                    e.preventDefault();
                }
            });
        }
    }
    
    updateControlsVisibility() {
        if (!this.game.creature) return;
        
        // Update dash/ram button text
        const dashButton = document.getElementById('dash-button');
        if (dashButton) {
            dashButton.textContent = (this.game.creature.type === 'dolphin' || this.game.creature.type === 'shark') ? 'RAM' : 'RAM';
        }

        // Show/hide ink button based on creature type
        if (this.inkButton) {
            this.inkButton.style.display = 
                (this.game.creature.type === 'squid' && 
                 this.game.creature.skinId !== 'octopus') ? 'block' : 'none';
        }
        
        // Show/hide camo button based on creature type and skin
        if (this.camoButton) {
            this.camoButton.style.display = 
                (this.game.creature.type === 'squid' && 
                 this.game.creature.skinId === 'octopus') ? 'block' : 'none';
        }
    }
}