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
        
        // Setup event listeners supporting touch, pointer, and click
        if (this.inkButton) {
            const triggerInk = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                if (this.game.creature && 
                    this.game.creature.type === 'squid' && 
                    this.game.creature.skinId !== 'octopus' &&
                    this.game.inkSystem) {
                    this.game.inkSystem.tryActivateInk();
                    this.updateControlsVisibility();
                }
            };
            
            this.inkButton.addEventListener('pointerdown', triggerInk);
            this.inkButton.addEventListener('touchstart', triggerInk);
            this.inkButton.addEventListener('click', triggerInk);
        }
        
        if (this.camoButton) {
            const triggerCamo = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                if (this.game.creature && 
                    this.game.creature.type === 'squid' && 
                    this.game.creature.skinId === 'octopus' &&
                    this.game.octopusAbilities) {
                    const activated = this.game.octopusAbilities.activateCamouflage(this.game.creature);
                    if (activated && this.game.room) {
                        this.game.room.updatePresence({
                            isCamouflaged: true,
                            camouflageReady: false,
                            camouflageActiveTimer: CONFIG.OCTOPUS_CAMOUFLAGE_DURATION,
                            camouflageTimer: 0
                        });
                    }
                    this.updateControlsVisibility();
                }
            };
            
            this.camoButton.addEventListener('pointerdown', triggerCamo);
            this.camoButton.addEventListener('touchstart', triggerCamo);
            this.camoButton.addEventListener('click', triggerCamo);
        }
    }
    
    updateControlsVisibility() {
        if (!this.game.creature) return;
        
        // Update dash/ram button text
        const dashButton = document.getElementById('dash-button');
        if (dashButton) {
            dashButton.textContent = 'RAM';
        }

        // Show/hide ink button based on creature type (flex keeps circular layout)
        if (this.inkButton) {
            const isSquid = this.game.creature.type === 'squid' && this.game.creature.skinId !== 'octopus';
            this.inkButton.style.display = isSquid ? 'flex' : 'none';
            if (isSquid) {
                this.inkButton.style.opacity = this.game.creature.inkReady ? '1' : '0.5';
            }
        }
        
        // Show/hide camo button based on creature type and skin
        if (this.camoButton) {
            const isOctopus = this.game.creature.type === 'squid' && this.game.creature.skinId === 'octopus';
            this.camoButton.style.display = isOctopus ? 'flex' : 'none';
            if (isOctopus) {
                this.camoButton.style.opacity = this.game.creature.camouflageReady ? '1' : '0.5';
            }
        }
    }
}
