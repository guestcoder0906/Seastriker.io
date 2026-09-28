import { CONFIG } from '../core/config.js';

export class PlayerInput {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.mouse = {
            x: 0, 
            y: 0, 
            pressed: false,
            lastMoveTime: performance.now(),
            isMoving: false
        };
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Mouse movement with motion tracking
        this.game.canvas.addEventListener('mousemove', (event) => {
            const dx = event.clientX - this.mouse.x;
            const dy = event.clientY - this.mouse.y;
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
            
            // Only update motion time if mouse actually moved beyond subpixel jitter
            if (dx * dx + dy * dy > 0.5) {
                this.mouse.lastMoveTime = performance.now();
                this.mouse.isMoving = true;
            }
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
            if (event.key === 'c' || event.key === 'C' || event.code === 'KeyC') {
                this.activateCreatureAbility();
            }
            
            // Q key activates ink for squid, and camouflage for octopus
            if (event.key === 'q' || event.key === 'Q' || event.code === 'KeyQ') {
                if (this.game.creature && this.game.creature.type === 'squid') {
                    if (this.game.creature.skinId === 'octopus') {
                        this.activateCreatureAbility();
                    } else if (this.game.inkSystem) {
                        this.game.inkSystem.tryActivateInk();
                    }
                }
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