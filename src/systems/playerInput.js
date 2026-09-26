import { CONFIG } from '../core/config.js';

export class PlayerInput {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.mouse = { x: 0, y: 0, pressed: false };
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Mouse movement
        this.game.canvas.addEventListener('mousemove', (event) => {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        });
        
        // Mouse buttons
        this.game.canvas.addEventListener('mousedown', (event) => {
            this.mouse.pressed = true;
        });
        
        this.game.canvas.addEventListener('mouseup', () => {
            this.mouse.pressed = false;
        });
        
        // Key handlers
        window.addEventListener('keydown', (event) => {
            this.keys[event.key] = true;
            
            // Activate camouflage on C key press for octopus
            if (event.key === 'c' || event.key === 'C') {
                this.activateCreatureAbility();
            }
            
            // Also activate camouflage on Q key for octopus (same as ink key)
            if (event.key === 'q' || event.key === 'Q') {
                this.activateCreatureAbility();
            }
        });
        
        window.addEventListener('keyup', (event) => {
            this.keys[event.key] = false;
        });
    }
    
    activateCreatureAbility() {
        // Check if the player is an octopus (has camouflage ability)
        if (this.game.creature && 
            this.game.creature.type === 'squid' && 
            this.game.creature.skinId === 'octopus' &&
            this.game.creature.isAlive && 
            this.game.creature.camouflageReady &&
            this.game.octopusAbilities &&
            this.game.room) {  
            
            // Try to activate camouflage
            const success = this.game.octopusAbilities.activateCamouflage(this.game.creature);
            
            if (success) {
                // Update presence with proper CONFIG reference
                this.game.room.updatePresence({
                    isCamouflaged: true,
                    camouflageReady: false,
                    camouflageActiveTimer: CONFIG.OCTOPUS_CAMOUFLAGE_DURATION,
                    camouflageTimer: 0
                });
            }
        }
    }
    
    getMousePosition() {
        return { ...this.mouse };
    }
    
    isKeyPressed(key) {
        return this.keys[key] === true;
    }
    
    resetInput() {
        this.keys = {};
        this.mouse.pressed = false;
    }
    
    setupMobileControls() {
        const camoButton = document.getElementById('camo-button');
        if (camoButton) {
            camoButton.addEventListener('touchstart', (e) => {
                this.activateCreatureAbility();
                e.preventDefault();
            });
        }
    }
}