import { CONFIG } from './config.js';
import { Narwhal } from '../entities/narwhal.js';
import { GameRenderer } from '../renderers/gameRenderer.js';
import { PlayerController } from '../systems/playerController.js';
import { HealthSystem } from '../systems/healthSystem.js';
import { AIController } from '../systems/aiController.js';
import { NarwhalCollisions } from '../systems/narwhalCollisions.js';
import { AIHealthSystem } from '../systems/aiHealthSystem.js';
import { AIAggression } from '../systems/aiAggression.js';
import { UpgradeSystem } from '../systems/upgradeSystem.js';
import { NarwhalSpeed } from '../systems/narwhalSpeed.js';
import { AIUpgradeSystem } from '../systems/aiUpgradeSystem.js';
import { CreatureFactory } from '../entities/creatureFactory.js';
import { SharkRenderer } from '../renderers/sharkRenderer.js';
import { SquidRenderer } from '../renderers/squidRenderer.js';
import { SquidAbilities } from '../systems/squidAbilities.js';
import { PlayerInput } from '../systems/playerInput.js';
import { InkSystem } from '../systems/inkSystem.js';
import { AICleanup } from '../systems/aiCleanup.js';
import { StartScreen } from '../ui/startScreen.js';
import { GameInitializer } from './gameInitializer.js';
import { ColorUtils } from '../utils/colorUtils.js';
import { PlayerStats } from '../ui/playerStats.js';
import { GlobalLeaderboard } from '../ui/globalLeaderboard.js';
import { GlobalLeaderboardManager } from '../ui/globalLeaderboardManager.js';
import { StatsScreen } from '../ui/statsScreen.js';
import { UsernameDisplay } from '../ui/usernameDisplay.js';
import { SkinSystem } from '../systems/skinSystem.js';
import { SkinsScreen } from '../ui/skinsScreen.js';
import { TimeManager } from './TimeManager.js';
import { SkinUnlockSystem } from '../systems/skinUnlockSystem.js';
import { SkinRewardSystem } from '../systems/skinRewardSystem.js';
import { SpecialSkinAccess } from '../systems/specialSkinAccess.js';
import { OctopusAbilities } from '../systems/octopusAbilities.js';
import { AIOctopusUpdater } from '../systems/aiOctopusUpdater.js';
import { OctopusTentacleEffect } from '../systems/octopusTentacleEffect.js';
import { CoralReefSystem } from '../systems/coralReefSystem.js';
import { CoralReefRenderer } from '../renderers/coralReefRenderer.js';
import { CoralReefEffectManager } from '../systems/coralReefEffectManager.js';
import { MobileControlsManager } from '../ui/mobileControlsManager.js';
import { KnifeFishAbilities } from '../systems/knifeFishAbilities.js';
import { KnifeFishDodgeHandler } from '../systems/knifeFishDodgeHandler.js';
import { WebsimSocket } from './websimSocket.js';

class NarwhaleGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        this.room = new WebsimSocket();
        this.creature = null;
        this.gameActive = false; 
        this.players = {};
        this.playerPresences = {};
        this.bubbles = [];
        
        this.keys = {};
        this.mouse = { x: 0, y: 0, pressed: false };
        this.camera = { x: 0, y: 0, scale: 1 };
        
        this.isMobile = this.detectMobile();
        this.mobileControls = {
            joystick: { active: false, startX: 0, startY: 0, moveX: 0, moveY: 0, angle: 0, power: 0 },
            dashActive: false,
            dodgeActive: false,
            fastSwimActive: false
        };
        
        this.colorUtils = new ColorUtils(); 
        this.narwhalSpeed = new NarwhalSpeed();
        this.roomState = this.room.roomState || {}; 
        this.setupEventListeners();
        this.healthSystem = new HealthSystem(this);
        this.narwhalCollisions = new NarwhalCollisions(this);
        this.renderer = new GameRenderer(this);
        this.sharkRenderer = new SharkRenderer(this);
        this.squidRenderer = new SquidRenderer(this); 
        this.playerController = new PlayerController(this);
        this.aiController = new AIController(this);
        this.aiHealthSystem = new AIHealthSystem(this);
        this.upgradeSystem = new UpgradeSystem(this);
        this.aiUpgradeSystem = new AIUpgradeSystem(this);
        this.squidAbilities = new SquidAbilities(this);
        this.playerInput = new PlayerInput(this);
        this.inkSystem = new InkSystem(this);
        this.aiCleanup = new AICleanup(this);
        
        this.skinSystem = new SkinSystem(this);
        this.gameInitializer = new GameInitializer(this);
        this.startScreen = new StartScreen(this);
        this.statsScreen = new StatsScreen(this);
        this.skinsScreen = new SkinsScreen(this);
        
        this.playerStats = new PlayerStats(this);
        this.globalLeaderboard = new GlobalLeaderboard(this); 
        this.globalLeaderboardManager = new GlobalLeaderboardManager(this); 
        this.statsScreen = new StatsScreen(this);
        this.usernameDisplay = new UsernameDisplay(this);
        
        this.timeManager = new TimeManager();
        this.skinUnlockSystem = new SkinUnlockSystem(this);
        this.skinRewardSystem = new SkinRewardSystem(this);
        this.specialSkinAccess = new SpecialSkinAccess(this);
        this.octopusAbilities = new OctopusAbilities(this);
        this.aiOctopusUpdater = new AIOctopusUpdater(this);
        this.octopusTentacleEffect = new OctopusTentacleEffect(this);
        
        this.coralReefSystem = new CoralReefSystem(this);
        this.coralReefRenderer = new CoralReefRenderer(this);
        this.coralReefEffectManager = new CoralReefEffectManager(this);
        
        this.knifeFishAbilities = new KnifeFishAbilities(this);
        this.knifeFishDodgeHandler = new KnifeFishDodgeHandler(this);
        
        if (this.isMobile) {
            this.mobileControlsManager = new MobileControlsManager(this);
        }
        
        this.initialize();
    }

    async initialize() {
        await this.room.initialize();
        
        this.room.subscribePresence(this.handlePresenceUpdate.bind(this));
        
        this.room.subscribePresenceUpdateRequests(this.handlePresenceRequest.bind(this));
        
        // Initialize special skin access
        this.specialSkinAccess.initialize();
        
        requestAnimationFrame(this.gameLoop.bind(this));
        
        this.generateBubbles(50);
        
        this.startScreen.show();
    }
    
    spawnPlayer(creatureType) {
        const spawnPoint = this.gameInitializer.generateSpawnPoint();
        
        const username = this.room.peers[this.room.clientId].username;
        
        this.creature = this.gameInitializer.createCreature(creatureType, spawnPoint.x, spawnPoint.y, username);
        this.narwhalSpeed.initializeNarwhal(this.creature);
        
        this.room.updatePresence(this.creature.getPresenceData());
        
        this.skinUnlockSystem.resetAllSessionKills();
        
        this.gameActive = true;
        
        if (this.isMobile && this.mobileControlsManager) {
            this.mobileControlsManager.updateControlsVisibility();
        }
        
        this.updateLeaderboard();
    }

    handlePresenceUpdate(presences) {
        this.playerPresences = presences;
        
        for (const aiId in this.aiController.aiPlayers) {
            if (this.aiController.aiPresences[aiId]) {
                this.playerPresences[aiId] = this.aiController.aiPresences[aiId];
            }
        }
        
        for (const clientId in this.playerPresences) {
            const presence = this.playerPresences[clientId];
            
            if (!this.players[clientId] && presence.isAlive) {
                this.players[clientId] = {
                    id: clientId,
                    name: this.room.peers[clientId]?.username || 
                          (clientId.startsWith('ai-') ? presence.name : "Unknown"),
                    segments: presence.segments,
                    color: presence.color,
                    isDashing: presence.isDashing,
                    isAlive: presence.isAlive,
                    kills: presence.kills
                };
            } 
            else if (this.players[clientId]) {
                this.players[clientId].segments = presence.segments;
                this.players[clientId].isDashing = presence.isDashing;
                this.players[clientId].isAlive = presence.isAlive;
                this.players[clientId].kills = presence.kills;
            }
        }

        this.updateLeaderboard();
    }

    gameLoop(timestamp) {
        const timeSteps = this.timeManager.update(timestamp);
        
        if (CONFIG.USE_FIXED_TIMESTEP) {
            for (let i = 0; i < timeSteps; i++) {
                this.update(this.timeManager.getFixedDeltaTime());
            }
        } else {
            this.update(timeSteps);
        }
        
        this.render();
        
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    update(deltaTime) {
        if (this.usernameDisplay) {
            this.usernameDisplay.updateCreatureNames();
        }
        
        if (this.gameActive) {
            this.healthSystem.updateHealth();
        }
        this.aiHealthSystem.updateAIHealth();
        
        this.upgradeSystem.updateNotifications();
        
        this.inkSystem.updateInkClouds();
        
        this.narwhalCollisions.cleanupCollisionHistory();
        
        if (this.gameActive && this.creature && this.creature.isAlive) {
            const targetX = this.camera.x + this.mouse.x;
            const targetY = this.camera.y + this.mouse.y;
            
            this.upgradeSystem.checkUpgrades(this.creature);
            
            this.narwhalSpeed.updateSpeedSettings(this.creature);
            
            if (this.creature.staminaCooldownModifier !== 1.0) {
                CONFIG.STAMINA_COOLDOWN = 60 * this.creature.staminaCooldownModifier;
            }
            
            this.creature.speed = this.narwhalSpeed.applySpeedModifier(
                this.creature, 
                CONFIG.BASE_SPEED
            );
            
            const isDodgePressed = !!(this.keys[' '] || this.keys['Space'] || this.keys['Spacebar'] || this.mobileControls?.dodgeActive);
            const isFastSwimPressed = !!(this.keys['Shift'] || this.mobileControls?.fastSwimActive);
            
            this.creature.update(
                targetX, 
                targetY, 
                this.mouse.pressed, 
                isDodgePressed, 
                isFastSwimPressed, 
                this.playerPresences
            );
            
            this.updateCamera();
            
            this.playerController.checkCollisions();
            
            this.room.updatePresence(this.creature.getPresenceData());
            
            if (this.creature.type === 'squid') {
                this.squidAbilities.updateInkStamina(this.creature, deltaTime);
                this.squidAbilities.checkTentacleHitboxes(this.creature);
            }
            if (this.creature.type === 'squid' && this.creature.skinId === 'octopus') {
                this.octopusAbilities.updateCamouflageStatus(this.creature, deltaTime);
                this.octopusAbilities.applyCamouflageUpgrades(this.creature);
                
                // Update presence with camouflage status
                if (this.creature.isCamouflaged) {
                    this.room.updatePresence({
                        isCamouflaged: this.creature.isCamouflaged,
                        camouflageActiveTimer: this.creature.camouflageActiveTimer
                    });
                }
            }
            
            this.playerStats.updateCurrentKills(this.creature.kills);
        } else if (this.gameActive && this.creature && !this.creature.isAlive) {
            this.handlePlayerDeath();
        }
        
        this.aiController.update();
        
        // Update AI octopus abilities
        if (this.aiOctopusUpdater) {
            for (const aiId in this.aiController.aiPlayers) {
                this.aiOctopusUpdater.updateAIOctopus(aiId, this.aiController.aiPlayers[aiId], deltaTime);
            }
        }
        
        this.aiCleanup.checkForStaleAI();
        
        // Update octopus tentacle effect system
        if (this.octopusTentacleEffect) {
            this.octopusTentacleEffect.checkEscaped();
        }
        
        this.coralReefSystem.update();
        
        if (Math.random() < CONFIG.BUBBLE_FREQUENCY) {
            this.generateBubbles(1);
        }
        
        this.updateBubbles(deltaTime);
        
        this.updateLeaderboard();
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.renderer.render(this.ctx, this.camera, this.playerPresences, this.creature, this.bubbles);
        
        if (this.gameActive && this.creature && this.creature.isInked) {
            this.inkSystem.drawInkEffect(this.ctx);
        }
    }

    handlePlayerDeath() {
        const killCount = this.creature.kills || 0;
        
        // Update the player stats with the current kills count
        this.playerStats.updateCurrentKills(killCount);
        this.playerStats.recordGameEnd();
        
        // Reset kill count in presence data immediately for leaderboard
        this.creature.kills = 0;
        this.room.updatePresence({
            kills: 0,
            isAlive: false
        });
        
        if (this.room.peers[this.room.clientId]?.username) {
            this.globalLeaderboardManager.submitScore(
                this.room.peers[this.room.clientId].username,
                this.playerStats.getStats().bestKills,
                this.playerStats.getStats().totalKills
            );
        }
        
        if (this.creature && this.creature.type) {
            this.skinUnlockSystem.resetSessionKills(this.creature.type);
        }
        
        this.gameActive = false;
        
        // Keep the current kill count when showing death screen
        this.startScreen.showDeathScreen(killCount);
        
        this.mouse.pressed = false;
        this.keys = {};
    }

    handlePresenceRequest(updateRequest, fromClientId) {
        if (!this.gameActive || !this.creature || !this.creature.isAlive) return;

        if (updateRequest.type === 'incrementKills') {
            const targetId = updateRequest.targetId;
            const alreadyProcessed = this._processedKills && this._processedKills[targetId];
            
            if (!alreadyProcessed) {
                if (!this._processedKills) this._processedKills = {};
                
                this._processedKills[targetId] = true;
                
                this.playerController.handleCollisionRequest(updateRequest, fromClientId);
                
                setTimeout(() => {
                    if (this._processedKills && this._processedKills[targetId]) {
                        delete this._processedKills[targetId];
                    }
                }, 5000);
            }
        } else {
            this.playerController.handleCollisionRequest(updateRequest, fromClientId);
        }
    }

    updateCamera() {
        const targetX = this.creature.segments[0].x - this.canvas.width / 2;
        const targetY = this.creature.segments[0].y - this.canvas.height / 2;
        
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
        
        if (this.isMobile) {
            this.camera.scale = CONFIG.MOBILE_CAMERA_SCALE;
        }
        
        this.camera.x = Math.max(0, Math.min(this.camera.x, CONFIG.WORLD_WIDTH - this.canvas.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, CONFIG.WORLD_HEIGHT - this.canvas.height));
    }

    generateBubbles(count) {
        for (let i = 0; i < count; i++) {
            this.bubbles.push({
                x: Math.random() * CONFIG.WORLD_WIDTH,
                y: Math.random() * CONFIG.WORLD_HEIGHT,
                size: CONFIG.BUBBLE_MIN_SIZE + Math.random() * (CONFIG.BUBBLE_MAX_SIZE - CONFIG.BUBBLE_MIN_SIZE),
                speedY: -0.5 - Math.random() * 1.5,
                opacity: 0.1 + Math.random() * 0.5
            });
        }
    }

    updateBubbles(deltaTime) {
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const bubble = this.bubbles[i];
            
            bubble.y += bubble.speedY;
            
            if (bubble.y < -bubble.size) {
                this.bubbles.splice(i, 1);
                
                this.bubbles.push({
                    x: Math.random() * CONFIG.WORLD_WIDTH,
                    y: CONFIG.WORLD_HEIGHT + bubble.size,
                    size: CONFIG.BUBBLE_MIN_SIZE + Math.random() * (CONFIG.BUBBLE_MAX_SIZE - CONFIG.BUBBLE_MIN_SIZE),
                    speedY: -0.5 - Math.random() * 1.5,
                    opacity: 0.1 + Math.random() * 0.5
                });
            }
        }
    }

    updateLeaderboard() {
        const leaderboardEl = document.getElementById('players-list');
        leaderboardEl.innerHTML = '';
        
        const players = [];
        
        if (this.creature) {
            players.push({
                id: this.room.clientId,
                name: this.room.peers[this.room.clientId]?.username || "You",
                kills: this.creature.kills,
                isLocal: true
            });
        }
        
        for (const clientId in this.playerPresences) {
            if (clientId !== this.room.clientId) {
                const presence = this.playerPresences[clientId];
                
                const name = clientId.startsWith('ai-') ? 
                             (presence.name || "AI Player") : 
                             (this.room.peers[clientId]?.username || "Unknown");
                
                players.push({
                    id: clientId,
                    name: name,
                    kills: presence.kills || 0,
                    isLocal: false,
                    isAI: clientId.startsWith('ai-')
                });
            }
        }
        
        players.sort((a, b) => b.kills - a.kills);
        
        players.forEach((player, index) => {
            const playerEntry = document.createElement('div');
            playerEntry.className = 'player-entry';
            
            const nameEl = document.createElement('div');
            nameEl.className = 'player-name';
            nameEl.textContent = `${index + 1}. ${player.name}`;
            
            if (player.isLocal) {
                nameEl.style.fontWeight = 'bold';
            }
            if (player.isAI) {
                nameEl.style.fontStyle = 'italic';
            }
            
            const killsEl = document.createElement('div');
            killsEl.className = 'player-kills';
            killsEl.textContent = player.kills;
            
            playerEntry.appendChild(nameEl);
            playerEntry.appendChild(killsEl);
            leaderboardEl.appendChild(playerEntry);
        });
    }

    getRandomCreatureColor() {
        const creatureType = Math.random();
        if (creatureType < 0.33) {
            return CONFIG.SQUID_COLOR; 
        } else if (creatureType < 0.66) {
            const baseHue = 240; 
            const hueVariation = 20;
            const saturation = 50 + Math.random() * 30; 
            const lightness = 30 + Math.random() * 20;    
            const hue = baseHue - hueVariation / 2 + Math.random() * hueVariation;
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        } else {
            const baseHue = 240; 
            const hueVariation = 30;
            const saturation = 20 + Math.random() * 20; 
            const lightness = 50 + Math.random() * 20;    
            const greyLightness = 80 + Math.random() * 15; 
            const useGrey = Math.random() < 0.5;          
            if (useGrey) {
                return `hsl(0, 0%, ${greyLightness}%)`; 
            } else {
                const hue = baseHue - hueVariation / 2 + Math.random() * hueVariation;
                return `hsl(${hue}, ${saturation}%, ${lightness}%)`; 
            }
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.canvas.addEventListener('mousemove', (event) => {
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        });
        
        this.canvas.addEventListener('mousedown', () => {
            this.mouse.pressed = true;
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.mouse.pressed = false;
        });
        
        window.addEventListener('keydown', (event) => {
            this.keys[event.key] = true;
        });
        
        window.addEventListener('keyup', (event) => {
            this.keys[event.key] = false;
        });
        
        if (this.isMobile) {
            this.setupMobileControls();
        }
    }

    detectMobile() {
        return window.innerWidth <= 768 || ('ontouchstart' in window);
    }

    resizeCanvas() {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;
        
        this.canvas.width = displayWidth;
        this.canvas.height = displayHeight;
        
        const viewport = document.querySelector("meta[name=viewport]");
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        }
    }

    setupMobileControls() {
        const joystickArea = document.getElementById('joystick-area');
        const joystick = document.getElementById('joystick');
        const dashButton = document.getElementById('dash-button');
        const dodgeButton = document.getElementById('dodge-button');
        const inkButton = document.getElementById('ink-button');
        
        const positionMobileControls = () => {
            const displayWidth = window.innerWidth;
            const displayHeight = window.innerHeight;
            
            if (displayWidth < 400) {
                joystickArea.style.left = '10px';
                joystickArea.style.bottom = '10px';
                
                dashButton.style.right = '20px';
                dashButton.style.bottom = '90px';
                
                dodgeButton.style.right = '20px';
                dodgeButton.style.bottom = '160px';
            } else {
                dashButton.style.right = '40px';
                dashButton.style.bottom = '80px';
                
                dodgeButton.style.right = '120px';
                dodgeButton.style.bottom = '140px';
            }
        };
        
        positionMobileControls();
        window.addEventListener('resize', positionMobileControls);
        
        joystickArea.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = joystickArea.getBoundingClientRect();
            this.mobileControls.joystick.active = true;
            this.mobileControls.joystick.startX = touch.clientX;
            this.mobileControls.joystick.startY = touch.clientY;
            e.preventDefault();
        });
        
        joystickArea.addEventListener('touchmove', (e) => {
            if (this.mobileControls.joystick.active) {
                const touch = e.touches[0];
                const rect = joystickArea.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                let deltaX = touch.clientX - this.mobileControls.joystick.startX;
                let deltaY = touch.clientY - this.mobileControls.joystick.startY;
                
                const maxDistance = rect.width / 2;
                const distance = Math.min(Math.sqrt(deltaX * deltaX + deltaY * deltaY), maxDistance);
                const angle = Math.atan2(deltaY, deltaX);
                
                joystick.style.left = (rect.width / 2 - joystick.offsetWidth / 2) + Math.cos(angle) * distance + 'px';
                joystick.style.top = (rect.height / 2 - joystick.offsetHeight / 2) + Math.sin(angle) * distance + 'px';
                
                this.mouse.x = this.canvas.width / 2 + Math.cos(angle) * (distance / maxDistance) * 300;
                this.mouse.y = this.canvas.height / 2 + Math.sin(angle) * (distance / maxDistance) * 300;
                
                this.mobileControls.joystick.angle = angle;
                this.mobileControls.joystick.power = distance / maxDistance;
                
                e.preventDefault();
            }
        });
        
        joystickArea.addEventListener('touchend', (e) => {
            this.mobileControls.joystick.active = false;
            
            joystick.style.left = '30px';
            joystick.style.top = '30px';
            e.preventDefault();
        });
        
        dashButton.addEventListener('touchstart', (e) => {
            this.mobileControls.dashActive = true;
            this.mouse.pressed = true;
            e.preventDefault();
        });
        
        dashButton.addEventListener('touchend', (e) => {
            this.mobileControls.dashActive = false;
            this.mouse.pressed = false;
            e.preventDefault();
        });
        
        dodgeButton.addEventListener('touchstart', (e) => {
            this.mobileControls.dodgeActive = true;
            e.preventDefault();
        });
        
        dodgeButton.addEventListener('touchend', (e) => {
            this.mobileControls.dodgeActive = false;
            e.preventDefault();
        });

        const fastSwimButton = document.getElementById('fastswim-button');
        if (fastSwimButton) {
            fastSwimButton.addEventListener('touchstart', (e) => {
                this.mobileControls.fastSwimActive = true;
                e.preventDefault();
            });
            fastSwimButton.addEventListener('touchend', (e) => {
                this.mobileControls.fastSwimActive = false;
                e.preventDefault();
            });
        }
    }

}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    new NarwhaleGame();
} else {
    window.addEventListener('load', () => {
        new NarwhaleGame();
    });
}