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
import { MultiplayerManager } from './multiplayerManager.js';
import { LeaderboardWidget } from '../ui/leaderboardWidget.js';

class NarwhaleGame {
    constructor() {
        if (typeof window !== 'undefined') {
            window.game = this;
        }
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        this.room = new MultiplayerManager();
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
        
        this.mobileControlsManager = new MobileControlsManager(this);
        this.leaderboardWidget = new LeaderboardWidget(this);
        
        this.interpolatedPresences = {};
        this._lastLeaderboardUpdate = 0;
        this._lastHudUpdate = 0;
        
        this.initialize();
    }

    async initialize() {
        await this.room.initialize();
        
        this.room.subscribePresence(this.handlePresenceUpdate.bind(this));
        
        this.room.subscribePresenceUpdateRequests(this.handlePresenceRequest.bind(this));

        this.room.subscribeKillFeed(this.showKillFeedMessage.bind(this));
        
        // Initialize special skin access
        this.specialSkinAccess.initialize();
        
        requestAnimationFrame(this.gameLoop.bind(this));
        
        this.generateBubbles(50);
        
        this.startScreen.show();
    }
    
    spawnPlayer(creatureType, overrideUsername) {
        const spawnPoint = this.gameInitializer.generateSpawnPoint();
        
        let username = overrideUsername || 
                       (this.room && this.room.peers && this.room.peers[this.room.clientId]?.username) || 
                       (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || 
                       "Player";
        
        try {
            localStorage.setItem('username', username);
        } catch (e) {}

        if (this.room && this.room.peers) {
            this.room.peers[this.room.clientId] = { id: this.room.clientId, username };
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

    handlePresenceUpdate(presences) {
        this.playerPresences = { ...presences };
        
        if (this.gameActive && this.creature && this.creature.isAlive) {
            this.playerPresences[this.room.clientId] = this.creature.getPresenceData();
        }
        
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

        // Clean up disconnected or dead players
        for (const id in this.players) {
            if (!this.playerPresences[id] || !this.playerPresences[id].isAlive) {
                delete this.players[id];
            }
        }
    }

    interpolateRemotePlayers(deltaTime) {
        if (!this.interpolatedPresences) {
            this.interpolatedPresences = {};
        }

        const validIds = new Set();
        // Frame-rate independent smoothing
        const lerpFactor = Math.min(1.0, 1.0 - Math.exp(-22 * Math.min(deltaTime, 0.1)));

        const normalizeAngle = (a) => {
            if (!Number.isFinite(a)) return 0;
            return Math.atan2(Math.sin(a), Math.cos(a));
        };

        const lerpAngle = (cur, tgt, f) => {
            if (cur === undefined) return tgt;
            if (tgt === undefined) return cur;
            let diff = normalizeAngle(tgt - cur);
            return normalizeAngle(cur + diff * f);
        };

        for (const clientId in this.playerPresences) {
            const target = this.playerPresences[clientId];
            if (!target || target.isAlive === false || (typeof target.health === 'number' && target.health <= 0) || !target.segments || target.segments.length === 0) {
                delete this.interpolatedPresences[clientId];
                delete this.players[clientId];
                continue;
            }

            // Local player is always authoritatively current
            if (clientId === this.room?.clientId || (this.creature && clientId === this.creature.id)) {
                if (this.gameActive && this.creature && this.creature.isAlive && (typeof this.creature.health !== 'number' || this.creature.health > 0)) {
                    this.interpolatedPresences[clientId] = this.creature.getPresenceData();
                    validIds.add(clientId);
                } else {
                    delete this.interpolatedPresences[clientId];
                    delete this.players[clientId];
                }
                continue;
            }

            validIds.add(clientId);

            // Local AI players run at full frame rate on the host
            if (clientId.startsWith('ai-') && this.aiController?.aiPresences[clientId]) {
                const aiPres = this.aiController.aiPresences[clientId];
                if (aiPres && aiPres.isAlive !== false && (typeof aiPres.health !== 'number' || aiPres.health > 0)) {
                    this.interpolatedPresences[clientId] = aiPres;
                } else {
                    delete this.interpolatedPresences[clientId];
                    delete this.players[clientId];
                }
                continue;
            }

            // Remote real players: smooth interpolation between incoming network packets
            if (!this.interpolatedPresences[clientId]) {
                this.interpolatedPresences[clientId] = {
                    ...target,
                    segments: Array.isArray(target.segments) 
                        ? target.segments.map(s => ({ ...s })) 
                        : []
                };
            } else {
                const current = this.interpolatedPresences[clientId];
                
                // Copy non-positional state
                current.id = target.id || clientId;
                current.name = target.name || current.name;
                current.color = target.color || current.color;
                current.type = target.type || current.type;
                current.skinId = target.skinId || current.skinId;
                current.isDashing = Boolean(target.isDashing);
                current.isDodging = Boolean(target.isDodging);
                current.isAlive = target.isAlive !== undefined ? Boolean(target.isAlive) : (current.isAlive !== undefined ? current.isAlive : true);
                current.kills = target.kills !== undefined ? target.kills : (current.kills || 0);
                current.health = target.health !== undefined ? target.health : current.health;
                current.isHiddenInReef = Boolean(target.isHiddenInReef);
                current.isCamouflaged = Boolean(target.isCamouflaged);
                current.camouflageActiveTimer = target.camouflageActiveTimer;
                current.upgrades = target.upgrades || current.upgrades;

                // Sync tentacles for squids and octopuses
                if (Array.isArray(target.tentacles)) {
                    current.tentacles = target.tentacles;
                }

                // Interpolate rotation angle
                if (target.rotationAngle !== undefined) {
                    current.rotationAngle = lerpAngle(current.rotationAngle ?? target.rotationAngle, target.rotationAngle, lerpFactor);
                }

                // Smoothly lerp segments
                if (Array.isArray(target.segments) && target.segments.length > 0) {
                    if (!Array.isArray(current.segments) || current.segments.length !== target.segments.length) {
                        current.segments = target.segments.map(s => ({ ...s }));
                    } else {
                        const headDistSq = (target.segments[0].x - current.segments[0].x) ** 2 + 
                                           (target.segments[0].y - current.segments[0].y) ** 2;
                        
                        if (headDistSq > 400 * 400) {
                            // Snap immediately on large jump / spawn / teleport
                            for (let i = 0; i < target.segments.length; i++) {
                                current.segments[i].x = target.segments[i].x;
                                current.segments[i].y = target.segments[i].y;
                                current.segments[i].angle = target.segments[i].angle;
                                current.segments[i].scale = target.segments[i].scale;
                            }
                        } else {
                            for (let i = 0; i < target.segments.length; i++) {
                                const tgtSeg = target.segments[i];
                                const curSeg = current.segments[i];
                                curSeg.x += (tgtSeg.x - curSeg.x) * lerpFactor;
                                curSeg.y += (tgtSeg.y - curSeg.y) * lerpFactor;
                                curSeg.angle = lerpAngle(curSeg.angle, tgtSeg.angle, lerpFactor);
                                curSeg.scale = tgtSeg.scale;
                            }
                        }
                    }
                    if (current.segments && current.segments[0]) {
                        current.x = current.segments[0].x;
                        current.y = current.segments[0].y;
                    }
                }
            }
        }

        // Clean up disconnected players
        for (const id in this.interpolatedPresences) {
            if (!validIds.has(id)) {
                delete this.interpolatedPresences[id];
            }
        }
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
        // Smoothly interpolate remote players between network updates
        this.interpolateRemotePlayers(deltaTime);
        const activePresences = this.interpolatedPresences || this.playerPresences;

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
                activePresences
            );
            
            this.updateCamera();
            
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
            }

            const localPresence = this.creature.getPresenceData();
            this.playerPresences[this.room.clientId] = localPresence;
            if (this.interpolatedPresences) {
                this.interpolatedPresences[this.room.clientId] = localPresence;
            }
            
            this.playerController.checkCollisions();
            
            this.room.updatePresence(localPresence);
            
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
        
        // Throttle DOM updates to avoid GC pauses and frame stutters
        const now = performance.now();
        if (now - this._lastLeaderboardUpdate > 250) {
            this._lastLeaderboardUpdate = now;
            this.updateLeaderboard();
        }
        if (now - this._lastHudUpdate > 250) {
            this._lastHudUpdate = now;
            this.updateGameModeHud();
        }
    }

    updateGameModeHud() {
        let hud = document.getElementById('game-mode-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'game-mode-hud';
            const container = document.getElementById('game-container') || document.body;
            container.appendChild(hud);
        }

        if (!this.gameActive) {
            hud.style.display = 'none';
            return;
        }

        hud.style.display = 'flex';

        if (this.room.gameMode === 'singleplayer') {
            const botCount = Object.keys(this.aiController.aiPlayers || {}).length;
            hud.innerHTML = `<span>🕹️ Single Player</span> <span style="opacity:0.5">•</span> <span style="color:#7dd3fc">${botCount} AI Predators</span>`;
        } else {
            const ping = this.room.pingMs;
            const peerCount = Object.keys(this.room.peers || {}).length;
            const roomName = this.room.supabase?.currentRoom || 'ocean-global-1';
            const isConn = this.room.supabase?.connectionStatus === 'connected';
            const statusDot = isConn ? '🟢' : '🟡';
            const pingStr = ping > 0 ? `${ping}ms` : 'Syncing';
            hud.innerHTML = `<span>⚡ Supabase Multiplayer</span> <span style="opacity:0.5">•</span> <span style="color:#38bdf8">${roomName}</span> <span style="opacity:0.5">•</span> <span>👥 ${peerCount}</span> <span style="opacity:0.5">•</span> <span>${statusDot} ${pingStr}</span>`;
        }
    }

    showKillFeedMessage(announcement) {
        if (!announcement) return;
        let feed = document.getElementById('kill-feed-container');
        if (!feed) {
            feed = document.createElement('div');
            feed.id = 'kill-feed-container';
            const container = document.getElementById('game-container') || document.body;
            container.appendChild(feed);
        }

        const item = document.createElement('div');
        item.className = `kill-feed-item ${announcement.type || 'kill'}`;

        if (announcement.type === 'kill') {
            item.textContent = `⚔️ ${announcement.killer} eliminated ${announcement.victim}`;
        } else if (announcement.type === 'join') {
            item.textContent = `🌊 ${announcement.username} dove into the arena`;
        } else if (announcement.type === 'leave') {
            item.textContent = `💨 ${announcement.username} left the waters`;
        } else {
            item.textContent = announcement.message || 'Ocean Event';
        }

        feed.appendChild(item);

        setTimeout(() => {
            item.style.transition = 'opacity 0.4s';
            item.style.opacity = '0';
            setTimeout(() => item.remove(), 400);
        }, 4000);
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const presencesToRender = this.interpolatedPresences || this.playerPresences;
        const localCreatureToRender = (this.gameActive && this.creature && this.creature.isAlive) ? this.creature : null;
        this.renderer.render(this.ctx, this.camera, presencesToRender, localCreatureToRender, this.bubbles);
        
        if (this.gameActive && this.creature && this.creature.isInked) {
            this.inkSystem.drawInkEffect(this.ctx);
        }
    }

    awardKill(victimName = "Predator", killedUpgrades = null) {
        if (!this.creature || !this.creature.isAlive) return;
        
        this.creature.kills = (this.creature.kills || 0) + 1;
        
        // Track kill for skin unlocks
        if (this.skinUnlockSystem && this.creature.type) {
            this.skinUnlockSystem.trackKill(this.creature.type);
        }
        
        // Update player stats
        if (this.playerStats) {
            if (typeof this.playerStats.recordKill === 'function') {
                this.playerStats.recordKill();
            }
            if (typeof this.playerStats.updateCurrentKills === 'function') {
                this.playerStats.updateCurrentKills(this.creature.kills);
            }
        }
        
        // Update presence
        if (this.room) {
            this.room.updatePresence({
                ...this.creature.getPresenceData(),
                kills: this.creature.kills
            });
            this.room.broadcastKill(this.creature.name || "Player", victimName);
        }
        
        // Show kill feed on screen
        this.showKillFeedMessage({
            type: 'kill',
            killer: this.creature.name || "Player",
            victim: victimName
        });
        
        // Update leaderboard
        this.updateLeaderboard();
    }

    handlePlayerDeath() {
        const killCount = this.creature ? (this.creature.kills || 0) : 0;
        
        // Update the player stats with the current kills count
        if (this.playerStats) {
            this.playerStats.updateCurrentKills(killCount);
            this.playerStats.recordGameEnd();
        }
        
        // Reset kill count in presence data immediately for leaderboard
        if (this.creature) {
            this.creature.kills = 0;
            this.creature.isAlive = false;
            this.creature.health = 0;
        }
        
        if (this.room) {
            this.room.updatePresence({
                id: this.room.clientId,
                kills: 0,
                isAlive: false,
                health: 0,
                segments: []
            });
        }

        // Clean up all local player presences from game state so it is removed from map immediately
        delete this.playerPresences[this.room?.clientId];
        if (this.interpolatedPresences) {
            delete this.interpolatedPresences[this.room?.clientId];
        }
        if (this.players) {
            delete this.players[this.room?.clientId];
        }
        
        const username = (this.room.peers && this.room.peers[this.room.clientId]?.username) || 
                         (typeof localStorage !== 'undefined' && localStorage.getItem('username')) || 
                         "Player";
        if (username && this.globalLeaderboardManager && this.playerStats) {
            this.globalLeaderboardManager.submitScore(
                username,
                this.playerStats.getStats().bestKills,
                this.playerStats.getStats().totalKills
            );
        }
        
        if (this.creature && this.creature.type && this.skinUnlockSystem) {
            this.skinUnlockSystem.resetSessionKills(this.creature.type);
        }
        
        this.gameActive = false;
        this.creature = null; // Completely remove creature reference so it is never drawn frozen
        this.updateGameModeHud();
        
        // Keep the current kill count when showing death screen
        if (this.startScreen) {
            this.startScreen.showDeathScreen(killCount);
        }
        
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
        if (!this.creature || !this.creature.segments || !this.creature.segments[0]) return;

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
        
        // Smooth bounds clamping accounting for screen scale so camera does not jump or clip
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

    generateBubbles(count) {
        if (this.bubbles.length >= 60) return;
        const toAdd = Math.min(count, 60 - this.bubbles.length);
        for (let i = 0; i < toAdd; i++) {
            this.bubbles.push({
                x: Math.random() * CONFIG.WORLD_WIDTH,
                y: Math.random() * CONFIG.WORLD_HEIGHT,
                size: CONFIG.BUBBLE_MIN_SIZE + Math.random() * (CONFIG.BUBBLE_MAX_SIZE - CONFIG.BUBBLE_MIN_SIZE),
                speedY: -0.3 - Math.random() * 0.8,
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
                    speedY: -0.3 - Math.random() * 0.8,
                    opacity: 0.1 + Math.random() * 0.5
                });
            }
        }
    }

    updateLeaderboard() {
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
            if (clientId !== this.room.clientId && (!this.creature || clientId !== this.creature.id)) {
                const presence = this.playerPresences[clientId];
                if (!presence || presence.isAlive === false) continue;
                
                const isAI = clientId.startsWith('ai-');
                const name = this.room.peers[clientId]?.username || 
                             (isAI ? (presence.name || "Sea Predator") : "Unknown Striker");
                
                players.push({
                    id: clientId,
                    name: name,
                    kills: presence.kills || 0,
                    isLocal: false,
                    isAI: isAI
                });
            }
        }
        
        players.sort((a, b) => b.kills - a.kills);
        
        if (this.leaderboardWidget) {
            this.leaderboardWidget.update(players);
        }
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