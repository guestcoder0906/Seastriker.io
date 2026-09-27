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
        if (typeof window !== 'undefined') {
            window.game = this;
        }
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        this.room = new WebsimSocket();
        this.creature = null;
        this.gameActive = false; 
        this.gameMode = 'global';
        this.previewMode = 'global';
        this.previewTargetId = null;
        this.previewSwitchTimer = 0;
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
        
        this.killFeed = [];
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
        
        this.mobileControlsManager = new MobileControlsManager(this);
        
        this.initialize();
    }

    async initialize() {
        await this.room.initialize();
        
        this.room.subscribePresence(this.handlePresenceUpdate.bind(this));
        this.room.subscribePresenceUpdateRequests(this.handlePresenceRequest.bind(this));
        this.room.subscribeKillBroadcast(this.handleKillBroadcast.bind(this));
        this.room.subscribeStatus(this.handleStatusUpdate.bind(this));
        
        // Initialize special skin access
        this.specialSkinAccess.initialize();
        
        requestAnimationFrame(this.gameLoop.bind(this));
        
        this.generateBubbles(50);
        
        this.startScreen.show();
    }
    
    handleStatusUpdate(status) {
        if (this.startScreen && typeof this.startScreen.updateNetworkStatus === 'function') {
            this.startScreen.updateNetworkStatus(status);
        }
        this.updateLeaderboard();
    }

    handleKillBroadcast(data) {
        if (!data) return;
        const isKiller = data.killerId === this.room.clientId;
        const isVictim = data.victimId === this.room.clientId;
        this.killFeed.unshift({
            killerName: data.killerName || "Player",
            victimName: data.victimName || "Creature",
            isKiller,
            isVictim,
            time: performance.now()
        });
        if (this.killFeed.length > 5) {
            this.killFeed.pop();
        }
        this.updateLeaderboard();
    }

    setGameMode(mode) {
        this.gameMode = mode === 'ai' ? 'ai' : 'global';
        this.previewMode = this.gameMode;
        if (this.room?.setGameMode) {
            this.room.setGameMode(this.gameMode);
        }
    }

    setPreviewMode(mode) {
        this.previewMode = mode === 'ai' ? 'ai' : 'global';
        this.previewTargetId = null;
        this.previewSwitchTimer = 99999;
        if (this.room?.setGameMode) {
            this.room.setGameMode(this.previewMode);
        }
    }

    getPreviewPresences() {
        if (!this.gameActive) {
            if (this.previewMode === 'ai') {
                const aiBots = Object.fromEntries(Object.entries(this.playerPresences).filter(([id]) => id.startsWith('ai-')));
                if (Object.keys(aiBots).length > 0) {
                    return aiBots;
                }
            } else {
                const globalPlayers = Object.fromEntries(Object.entries(this.playerPresences).filter(([id, p]) => !id.startsWith('ai-') && !this.isSelf(id, p)));
                if (Object.keys(globalPlayers).length > 0) {
                    return globalPlayers;
                }
            }

            if (this.room?.getPreviewPresences) {
                const pres = this.room.getPreviewPresences(this.previewMode);
                if (pres && Object.keys(pres).length > 0) {
                    return pres;
                }
            }
            return {};
        }

        // Active game: filter by current mode
        if (this.gameMode === 'global') {
            // Real players only! No AI bots
            const filtered = {};
            for (const id in this.playerPresences) {
                if (!id.startsWith('ai-') && !this.isSelf(id, this.playerPresences[id])) {
                    filtered[id] = this.playerPresences[id];
                }
            }
            return filtered;
        } else {
            return this.playerPresences;
        }
    }

    spawnPlayer(creatureType, overrideUsername, mode) {
        if (mode) {
            this.setGameMode(mode);
        } else if (this.previewMode) {
            this.setGameMode(this.previewMode);
        }

        const spawnPoint = this.gameInitializer.generateSpawnPoint();
        
        let username = overrideUsername || 
                       (this.room && this.room.peers && this.room.peers[this.room.clientId]?.username) || 
                       (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || 
                       "Player";
        
        try {
            localStorage.setItem('username', username);
        } catch (e) {}

        if (this.room && this.room.peers) {
            this.room.peers[this.room.clientId] = { id: this.room.clientId, username, kills: 0 };
        }
        
        this.creature = this.gameInitializer.createCreature(creatureType, spawnPoint.x, spawnPoint.y, username);
        this.creature.id = this.room.clientId;
        this.creature.name = username;
        this.narwhalSpeed.initializeNarwhal(this.creature);
        
        this.room.updatePresence(this.creature.getPresenceData());
        
        this.skinUnlockSystem.resetAllSessionKills();
        
        this.gameActive = true;
        
        if (this.mobileControlsManager) {
            this.mobileControlsManager.updateControlsVisibility();
        }
        
        this.updateLeaderboard();
    }

    isSelf(clientId, presence) {
        if (!clientId && !presence) return false;
        if (this.room?.isSelf && this.room.isSelf(clientId, presence)) return true;
        if (clientId && (clientId === this.room?.clientId || clientId === this.room?.socketId || clientId === this.room?.socket?.id)) return true;
        if (this.creature && (clientId === this.creature.id || (presence && presence.id === this.creature.id))) return true;
        if (presence && presence.id && (presence.id === this.room?.clientId || presence.id === this.room?.socketId || presence.id === this.room?.socket?.id)) return true;
        return false;
    }

    handlePresenceUpdate(presences) {
        // Strip out any duplicate / self presences from incoming data
        const filtered = {};
        for (const clientId in presences) {
            const p = presences[clientId];
            if (!this.isSelf(clientId, p)) {
                // If remote entity already has smoothly interpolated segments, preserve them in filtered
                if (this.players[clientId] && this.players[clientId].segments && this.players[clientId].segments.length > 0) {
                    filtered[clientId] = {
                        ...p,
                        segments: this.players[clientId].segments,
                        x: this.players[clientId].segments[0].x,
                        y: this.players[clientId].segments[0].y,
                        angle: this.players[clientId].segments[0].angle
                    };
                } else {
                    filtered[clientId] = { ...p };
                }
            }
        }
        this.playerPresences = filtered;
        
        // Put self under this.room.clientId ONLY
        if (this.gameActive && this.creature && this.creature.isAlive) {
            this.playerPresences[this.room.clientId] = this.creature.getPresenceData();
        }
        
        // Only run local bots if completely disconnected from multiplayer server
        if (!this.room.isServerConnected) {
            for (const aiId in this.aiController.aiPlayers) {
                if (this.aiController.aiPresences[aiId]) {
                    this.playerPresences[aiId] = this.aiController.aiPresences[aiId];
                }
            }
        }
        
        // Clean up self from this.players if ever present
        for (const pid in this.players) {
            if (this.isSelf(pid, this.players[pid])) {
                delete this.players[pid];
            }
        }
        
        for (const clientId in presences) {
            const presence = presences[clientId];
            if (!presence || this.isSelf(clientId, presence)) {
                continue; // DO NOT interpolate self in this.players
            }
            
            if (!this.players[clientId] && presence.isAlive) {
                const initialSegs = presence.segments ? presence.segments.map(s => ({ ...s })) : [];
                this.players[clientId] = {
                    id: clientId,
                    name: this.room.peers[clientId]?.username || 
                          presence.name || 
                          (clientId.startsWith('ai-') ? "Creature" : "Player"),
                    segments: initialSegs,
                    targetSegments: presence.segments ? presence.segments.map(s => ({ ...s })) : [],
                    color: presence.color,
                    type: presence.type || 'narwhal',
                    skinId: presence.skinId || 'default',
                    isDashing: presence.isDashing,
                    isAlive: presence.isAlive,
                    kills: presence.kills || 0,
                    tentacles: presence.tentacles ? presence.tentacles.map(t => t.map(s => ({ ...s }))) : null
                };
                if (this.playerPresences[clientId]) {
                    this.playerPresences[clientId].segments = this.players[clientId].segments;
                    if (presence.tentacles) {
                        this.playerPresences[clientId].tentacles = this.players[clientId].tentacles;
                    }
                }
            } 
            else if (this.players[clientId]) {
                if (presence.segments && presence.segments.length > 0) {
                    this.players[clientId].targetSegments = presence.segments.map(s => ({ ...s }));
                }
                this.players[clientId].isDashing = presence.isDashing;
                this.players[clientId].isAlive = presence.isAlive;
                this.players[clientId].kills = presence.kills || 0;
                if (presence.tentacles) {
                    this.players[clientId].tentacles = presence.tentacles;
                }
                if (!this.players[clientId].segments || this.players[clientId].segments.length === 0) {
                    this.players[clientId].segments = presence.segments ? presence.segments.map(s => ({ ...s })) : [];
                }
                if (this.playerPresences[clientId]) {
                    this.playerPresences[clientId].segments = this.players[clientId].segments;
                    if (this.players[clientId].tentacles) {
                        this.playerPresences[clientId].tentacles = this.players[clientId].tentacles;
                    }
                }
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
        // Smoothly interpolate remote players between network ticks
        for (const clientId in this.players) {
            if (this.isSelf(clientId, this.players[clientId])) {
                delete this.players[clientId];
                continue;
            }
            const p = this.players[clientId];
            if (p && p.targetSegments && p.targetSegments[0] && p.segments && p.segments[0]) {
                const targetHead = p.targetSegments[0];
                const currentHead = p.segments[0];
                const distToTarget = Math.hypot(targetHead.x - currentHead.x, targetHead.y - currentHead.y);

                if (distToTarget > 400 || isNaN(distToTarget) || isNaN(currentHead.x) || isNaN(currentHead.y)) {
                    // Teleport / Respawn snap / NaN recovery
                    p.segments = p.targetSegments.map(s => ({ ...s }));
                } else {
                    // Adaptive responsive lerp: high agility when dashing or further away, buttery smooth when cruising
                    const lerpFactor = distToTarget > 120 ? 0.52 : (p.isDashing ? 0.44 : 0.36);
                    currentHead.x += (targetHead.x - currentHead.x) * lerpFactor;
                    currentHead.y += (targetHead.y - currentHead.y) * lerpFactor;
                    
                    let diff = (targetHead.angle || 0) - (currentHead.angle || 0);
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    currentHead.angle = (currentHead.angle || 0) + diff * lerpFactor;

                    // Match segment array lengths safely
                    while (p.segments.length < p.targetSegments.length) {
                        const last = p.segments[p.segments.length - 1] || targetHead;
                        p.segments.push({ ...last });
                    }
                    if (p.segments.length > p.targetSegments.length) {
                        p.segments.length = p.targetSegments.length;
                    }

                    // Forward kinematics with natural fixed joint spacing
                    const spacing = 13.5;
                    for (let i = 1; i < p.segments.length; i++) {
                        const prev = p.segments[i - 1];
                        const cur = p.segments[i];
                        const dx = prev.x - cur.x;
                        const dy = prev.y - cur.y;
                        const ang = Math.atan2(dy, dx);
                        cur.x = prev.x - Math.cos(ang) * spacing;
                        cur.y = prev.y - Math.sin(ang) * spacing;
                        cur.angle = ang;
                        if (p.targetSegments[i]) {
                            cur.scale = p.targetSegments[i].scale;
                            cur.round = p.targetSegments[i].round;
                        }
                    }
                }
                
                if (this.playerPresences[clientId]) {
                    this.playerPresences[clientId].segments = p.segments;
                    this.playerPresences[clientId].x = p.segments[0].x;
                    this.playerPresences[clientId].y = p.segments[0].y;
                    this.playerPresences[clientId].angle = p.segments[0].angle;
                    this.playerPresences[clientId].isDashing = p.isDashing;
                    if (p.tentacles) {
                        this.playerPresences[clientId].tentacles = p.tentacles;
                    }
                }
            }
        }

        if (this.usernameDisplay) {
            this.usernameDisplay.updateCreatureNames();
        }
        
        if (this.gameActive) {
            this.healthSystem.updateHealth();
        }
        this.aiHealthSystem.updateAIHealth();
        
        this.inkSystem.updateInkClouds();
        
        this.narwhalCollisions.cleanupCollisionHistory();
        
        if (this.gameActive && this.creature && this.creature.isAlive) {
            const targetX = this.camera.x + this.mouse.x;
            const targetY = this.camera.y + this.mouse.y;
            
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
            
            // Keep local player presence current for AI targeting and collision detection
            this.playerPresences[this.room.clientId] = this.creature.getPresenceData();
            
            this.playerController.checkCollisions();
            
            this.room.updatePresence(this.creature.getPresenceData());
            
            if (this.creature.type === 'squid') {
                const wasReady = this.creature.inkReady;
                this.squidAbilities.updateInkStamina(this.creature, deltaTime);
                if (this.mobileControlsManager && wasReady !== this.creature.inkReady) {
                    this.mobileControlsManager.updateControlsVisibility();
                }
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
        
        // Only run local bots if disconnected from server (server runs authoritative synchronized bots)
        if (!this.room.isServerConnected) {
            this.aiController.update();
            
            // Update AI octopus abilities
            if (this.aiOctopusUpdater) {
                for (const aiId in this.aiController.aiPlayers) {
                    this.aiOctopusUpdater.updateAIOctopus(aiId, this.aiController.aiPlayers[aiId], deltaTime);
                }
            }
            
            this.aiCleanup.checkForStaleAI();
        }
        
        // Update octopus tentacle effect system
        if (this.octopusTentacleEffect) {
            this.octopusTentacleEffect.checkEscaped();
        }
        
        this.coralReefSystem.update();
        
        if (Math.random() < CONFIG.BUBBLE_FREQUENCY) {
            this.generateBubbles(1);
        }
        
        this.updateBubbles(deltaTime);

        // While on start screen / menu, run live preview camera tracking
        if (!this.gameActive) {
            this.updatePreviewCamera(deltaTime);
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const activePresences = this.getPreviewPresences();
        this.renderer.render(this.ctx, this.camera, activePresences, this.creature, this.bubbles);
        
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
        
        const username = (this.room.peers && this.room.peers[this.room.clientId]?.username) || 
                         (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || 
                         "Player";
        if (username) {
            this.globalLeaderboardManager.submitScore(
                username,
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

    clampCamera(scale = 1) {
        const halfW = (this.canvas.width / 2);
        const halfH = (this.canvas.height / 2);
        const minCamX = halfW * (1 / scale - 1);
        const maxCamX = CONFIG.WORLD_WIDTH - (this.canvas.width / scale) + halfW * (1 / scale - 1);
        const minCamY = halfH * (1 / scale - 1);
        const maxCamY = CONFIG.WORLD_HEIGHT - (this.canvas.height / scale) + halfH * (1 / scale - 1);
        
        if (maxCamX >= minCamX) {
            this.camera.x = Math.max(minCamX, Math.min(this.camera.x, maxCamX));
        }
        if (maxCamY >= minCamY) {
            this.camera.y = Math.max(minCamY, Math.min(this.camera.y, maxCamY));
        }
    }

    updateCamera() {
        let scale = 1;
        if (this.isMobile) {
            const smallerDimension = Math.min(window.innerWidth, window.innerHeight);
            scale = smallerDimension < 400 ? CONFIG.MOBILE_CAMERA_SCALE * 0.8 : CONFIG.MOBILE_CAMERA_SCALE;
            this.camera.scale = scale;
        }
        
        const targetX = this.creature.segments[0].x - this.canvas.width / 2;
        const targetY = this.creature.segments[0].y - this.canvas.height / 2;
        
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
        
        this.clampCamera(scale);
    }

    updatePreviewCamera(deltaTime = 16) {
        let scale = 1;
        if (this.isMobile) {
            const smallerDimension = Math.min(window.innerWidth, window.innerHeight);
            scale = smallerDimension < 400 ? CONFIG.MOBILE_CAMERA_SCALE * 0.8 : CONFIG.MOBILE_CAMERA_SCALE;
            this.camera.scale = scale;
        }

        const now = performance.now();
        this.previewSwitchTimer = (this.previewSwitchTimer || 0) + deltaTime;

        let targetX = CONFIG.WORLD_WIDTH / 2;
        let targetY = CONFIG.WORLD_HEIGHT / 2;
        let foundEntity = false;

        const previewPresences = this.getPreviewPresences();

        if (this.previewMode === 'ai') {
            const aiKeys = Object.keys(previewPresences).filter(k => k.startsWith('ai-') && previewPresences[k]?.isAlive);
            if (aiKeys.length > 0) {
                if (!this.previewTargetId || !previewPresences[this.previewTargetId]?.isAlive || this.previewSwitchTimer > 7000) {
                    this.previewSwitchTimer = 0;
                    this.previewTargetId = aiKeys[Math.floor(Math.random() * aiKeys.length)];
                }
                const targetEntity = previewPresences[this.previewTargetId];
                if (targetEntity && targetEntity.x !== undefined && targetEntity.y !== undefined) {
                    targetX = targetEntity.x;
                    targetY = targetEntity.y;
                    foundEntity = true;
                }
            }
        } else {
            const humanKeys = Object.keys(previewPresences).filter(k => !k.startsWith('ai-') && previewPresences[k]?.isAlive);
            if (humanKeys.length > 0) {
                if (!this.previewTargetId || !previewPresences[this.previewTargetId]?.isAlive || this.previewSwitchTimer > 8000) {
                    this.previewSwitchTimer = 0;
                    this.previewTargetId = humanKeys[Math.floor(Math.random() * humanKeys.length)];
                }
                const targetEntity = previewPresences[this.previewTargetId];
                if (targetEntity && targetEntity.x !== undefined && targetEntity.y !== undefined) {
                    targetX = targetEntity.x;
                    targetY = targetEntity.y;
                    foundEntity = true;
                }
            }
        }

        if (!foundEntity) {
            // Ambient cinematic glide around scenic coral reef zones
            const t = now * 0.00045;
            targetX = 1250 + Math.sin(t) * 450;
            targetY = 1250 + Math.cos(t * 0.75) * 350;
        }

        const desiredCamX = targetX - (this.canvas.width / 2);
        const desiredCamY = targetY - (this.canvas.height / 2);

        this.camera.x += (desiredCamX - this.camera.x) * 0.06;
        this.camera.y += (desiredCamY - this.camera.y) * 0.06;

        this.clampCamera(scale);
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

    updateLeaderboard(force = false) {
        const now = performance.now();
        if (!force && this._lastLeaderboardUpdate && (now - this._lastLeaderboardUpdate < 400)) {
            return;
        }
        this._lastLeaderboardUpdate = now;

        const leaderboardEl = document.getElementById('players-list');
        if (!leaderboardEl) return;
        
        const players = [];
        
        if (this.creature) {
            players.push({
                id: this.room.clientId,
                name: this.creature.name || this.room.peers[this.room.clientId]?.username || "You",
                kills: this.creature.kills || 0,
                isLocal: true,
                isAI: false
            });
        }
        
        for (const clientId in this.playerPresences) {
            // AIs DO NOT count as players - only real human players are shown on the leaderboard
            if (clientId.startsWith('ai-')) {
                continue;
            }
            const presence = this.playerPresences[clientId];
            if (this.isSelf(clientId, presence)) {
                continue;
            }
            const name = this.room.peers[clientId]?.username || presence?.name || "Player";
            const kills = (this.room.peers[clientId]?.kills !== undefined ? this.room.peers[clientId].kills : presence?.kills) || 0;
            
            players.push({
                id: clientId,
                name: name,
                kills: kills,
                isLocal: false,
                isAI: false
            });
        }
        
        players.sort((a, b) => b.kills - a.kills);
        
        let html = '';
        players.slice(0, 10).forEach((player, index) => {
            const boldStyle = player.isLocal ? 'style="font-weight: bold; color: #38bdf8;"' : '';
            html += `<div class="player-entry">
                <div class="player-name" ${boldStyle}>${index + 1}. ${player.name}${player.isLocal ? ' (You)' : ''}</div>
                <div class="player-kills">${player.kills}</div>
            </div>`;
        });
        if (players.length === 1) {
            html += `<div class="player-entry" style="opacity: 0.6; font-size: 11px; justify-content: center; padding: 4px 0;">
                <em>Waiting for rivals to join...</em>
            </div>`;
        }
        leaderboardEl.innerHTML = html;
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
            
            const rect = joystickArea.getBoundingClientRect();
            joystick.style.left = (rect.width / 2 - joystick.offsetWidth / 2) + 'px';
            joystick.style.top = (rect.height / 2 - joystick.offsetHeight / 2) + 'px';
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