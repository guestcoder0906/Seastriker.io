import { io } from "socket.io-client";
import { joinRoom, selfId } from "@trystero-p2p/mqtt";

export function isLocalOrRunApp() {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
}

export class WebsimSocket {
    constructor() {
        this.socket = null;
        this.trysteroRoom = null;
        this.clientId = selfId || ("player_" + Math.random().toString(36).substring(2, 9));
        this.username = "Player";
        this.peers = {};
        this.roomState = {
            globalLeaderboard: {
                bestKills: {},
                totalKills: {}
            }
        };
        this.localPresences = {};
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
        this.damageCallbacks = [];
        this.killBroadcastCallbacks = [];
        this.killAwardedCallbacks = [];
        this.statusCallbacks = [];

        this.isServerConnected = false;
        this.isP2PConnected = false;
        this.isConnecting = true;
        this.isHost = false;
        this.lastPresenceEmit = 0;

        // P2P Action dispatchers
        this.actions = null;
        this.botSimulationInterval = null;
        this.serverBots = null;

        // Load cached room state from localStorage
        try {
            const saved = localStorage.getItem('narwhal_room_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.roomState = { ...this.roomState, ...parsed };
                }
            }
        } catch (e) {}

        this.initBots();
    }

    initBots() {
        const configs = [
            { id: "ai-0", name: "AquaGlider", type: "narwhal", skinId: "default", color: "#38bdf8", x: 700, y: 700, angle: 0.5 },
            { id: "ai-1", name: "ApexShark", type: "shark", skinId: "default", color: "#64748b", x: 1800, y: 800, angle: 2.2 },
            { id: "ai-2", name: "WaveRider", type: "dolphin", skinId: "default", color: "#0284c7", x: 900, y: 1700, angle: -1.2 },
            { id: "ai-3", name: "AbyssSquid", type: "squid", skinId: "default", color: "#ec4899", x: 1900, y: 1900, angle: 3.0 },
            { id: "ai-4", name: "PhantomFin", type: "knifefish", skinId: "default", color: "#a855f7", x: 1300, y: 1200, angle: 1.0 },
            { id: "ai-5", name: "HammerheadBot", type: "shark", skinId: "hammerhead", color: "#475569", x: 1600, y: 1500, angle: -2.5 }
        ];

        this.serverBots = configs.map(cfg => ({
            ...cfg,
            targetAngle: cfg.angle,
            speed: 4.2,
            health: 100,
            maxHealth: 100,
            kills: 0,
            isAlive: true,
            respawnTime: 0,
            turnTimer: Math.random() * 2000,
            segments: this.createBotSegments(cfg.type, cfg.x, cfg.y, cfg.angle)
        }));
    }

    createBotSegments(type, startX, startY, angle) {
        const segments = [];
        const count = 15;
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            let scale = 1.0;
            if (type === "narwhal") {
                scale = t <= 0.28 ? 1.75 + (2.38 - 1.75) * (t / 0.28) : 2.38 - (2.38 - 0.5) * Math.pow((t - 0.28) / 0.72, 0.88);
                scale *= 0.9;
            } else if (type === "shark") {
                scale = 1.8 * (1 - t * 0.75);
            } else if (type === "dolphin") {
                scale = 1.7 * (1 - t * 0.7);
            } else if (type === "squid") {
                scale = 1.6 * (1 - t * 0.6);
            } else {
                scale = 1.4 * (1 - t * 0.7);
            }
            segments.push({
                x: startX - i * 14 * Math.cos(angle),
                y: startY - i * 14 * Math.sin(angle),
                angle,
                scale,
                round: i === 0
            });
        }
        return segments;
    }

    async initialize() {
        try {
            const savedUsername = localStorage.getItem('username');
            if (savedUsername && savedUsername.trim()) {
                this.username = savedUsername.trim().substring(0, 16);
            } else {
                this.username = "Player_" + Math.floor(100 + Math.random() * 900);
                try { localStorage.setItem('username', this.username); } catch (e) {}
            }
        } catch (e) {}

        this.peers[this.clientId] = { id: this.clientId, username: this.username, kills: 0 };

        // 1. Try local Socket.IO connection first if on localhost
        if (isLocalOrRunApp()) {
            await this.trySocketIo();
        }

        // 2. Initialize real-time WebRTC room (active on Vercel / seastriker.io)
        this.initP2PRoom();

        this.isConnecting = false;
        this.notifyStatus();
    }

    trySocketIo() {
        return new Promise((resolve) => {
            try {
                this.socket = io({
                    auth: { username: this.username },
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 3,
                    reconnectionDelay: 1000,
                    timeout: 2500
                });

                this.socket.on('connect', () => {
                    this.isServerConnected = true;
                    if (this.socket.id) {
                        this.clientId = this.socket.id;
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    this.notifyStatus();
                    resolve();
                });

                this.socket.on('init', (data) => {
                    this.isServerConnected = true;
                    if (data.id) this.clientId = data.id;
                    if (data.roomState) this.roomState = data.roomState;
                    if (data.peers) this.peers = data.peers;
                    if (data.bots) this.localPresences = { ...data.bots, ...this.localPresences };
                    this.notifyStatus();
                    resolve();
                });

                this.socket.on('networkTick', (data) => {
                    if (!data) return;
                    if (data.peers) this.peers = data.peers;
                    const combined = { ...(data.bots || {}), ...(data.players || {}) };
                    this.localPresences = combined;
                    for (const cb of this.presenceCallbacks) cb(combined);
                    this.notifyStatus();
                });

                this.socket.on('presence', (presences) => {
                    this.localPresences = { ...this.localPresences, ...presences };
                    for (const cb of this.presenceCallbacks) cb(this.localPresences);
                });

                this.socket.on('takeDamage', (data) => {
                    this.handleIncomingDamage(data);
                });

                this.socket.on('killBroadcast', (data) => {
                    for (const cb of this.killBroadcastCallbacks) cb(data);
                });

                this.socket.on('killAwarded', (data) => {
                    this.handleKillAwarded(data);
                });

                this.socket.on('peerJoined', (peer) => {
                    this.peers[peer.id] = peer;
                    this.notifyStatus();
                });

                this.socket.on('peerLeft', (id) => {
                    delete this.peers[id];
                    delete this.localPresences[id];
                    this.notifyStatus();
                    for (const cb of this.presenceCallbacks) cb(this.localPresences);
                });

                this.socket.on('connect_error', () => {
                    this.isServerConnected = false;
                    resolve();
                });

                setTimeout(resolve, 2000);
            } catch (e) {
                resolve();
            }
        });
    }

    initP2PRoom() {
        try {
            const config = {
                appId: 'seastriker-ocean-pvp-v2'
            };

            this.trysteroRoom = joinRoom(config, 'ocean-arena-main');

            // Set up real-time WebRTC channels
            const [sendPresence, onPresence] = this.trysteroRoom.makeAction('presence');
            const [sendPeerInfo, onPeerInfo] = this.trysteroRoom.makeAction('peerInfo');
            const [sendAttackPlayer, onAttackPlayer] = this.trysteroRoom.makeAction('attackPlayer');
            const [sendAttackBot, onAttackBot] = this.trysteroRoom.makeAction('attackBot');
            const [sendKillBroadcast, onKillBroadcast] = this.trysteroRoom.makeAction('killBroadcast');
            const [sendBotTick, onBotTick] = this.trysteroRoom.makeAction('botTick');

            this.actions = {
                sendPresence,
                sendPeerInfo,
                sendAttackPlayer,
                sendAttackBot,
                sendKillBroadcast,
                sendBotTick
            };

            this.trysteroRoom.onPeerJoin((peerId) => {
                this.isP2PConnected = true;
                this.peers[peerId] = { id: peerId, username: 'Player', kills: 0 };
                
                // Send our info to the newly joined peer
                sendPeerInfo({
                    id: this.clientId,
                    username: this.username,
                    kills: this.peers[this.clientId]?.kills || 0
                }, peerId);

                if (this.localPresences[this.clientId]) {
                    sendPresence(this.localPresences[this.clientId], peerId);
                }

                this.updateHostElection();
                this.notifyStatus();
            });

            this.trysteroRoom.onPeerLeave((peerId) => {
                delete this.peers[peerId];
                delete this.localPresences[peerId];
                this.updateHostElection();
                this.notifyStatus();
                for (const cb of this.presenceCallbacks) {
                    cb(this.localPresences);
                }
            });

            onPeerInfo((data, peerId) => {
                if (!data) return;
                this.isP2PConnected = true;
                this.peers[peerId] = {
                    id: peerId,
                    username: data.username || 'Player',
                    kills: data.kills || 0
                };
                this.notifyStatus();
            });

            onPresence((data, peerId) => {
                if (!data || this.isServerConnected) return;
                data.id = peerId;
                data.name = this.peers[peerId]?.username || data.name || 'Player';
                this.localPresences[peerId] = data;
                for (const cb of this.presenceCallbacks) {
                    cb(this.localPresences);
                }
            });

            onAttackPlayer((data, attackerId) => {
                if (!data || data.targetId !== this.clientId) return;
                this.handleIncomingDamage({
                    attackerId,
                    attackerName: this.peers[attackerId]?.username || 'Player',
                    damage: data.damage,
                    hitType: data.hitType,
                    knockbackAngle: data.angle,
                    knockbackForce: data.knockbackForce
                });
            });

            onAttackBot((data, attackerId) => {
                if (!this.isHost || !data || !data.botId) return;
                const bot = this.serverBots.find(b => b.id === data.botId);
                if (!bot || !bot.isAlive) return;

                bot.health -= (data.damage || 25);
                if (bot.health <= 0) {
                    bot.health = 0;
                    bot.isAlive = false;
                    bot.respawnTime = Date.now() + 5000;

                    const killerName = this.peers[attackerId]?.username || 'Player';
                    if (this.peers[attackerId]) {
                        this.peers[attackerId].kills = (this.peers[attackerId].kills || 0) + 1;
                    }

                    const broadcast = {
                        killerId: attackerId,
                        killerName,
                        victimId: bot.id,
                        victimName: bot.name
                    };

                    this.actions.sendKillBroadcast(broadcast);
                    for (const cb of this.killBroadcastCallbacks) cb(broadcast);

                    if (attackerId === this.clientId) {
                        this.handleKillAwarded({ victimName: bot.name, kills: this.peers[this.clientId].kills });
                    }
                }
            });

            onKillBroadcast((data) => {
                if (!data) return;
                if (this.peers[data.killerId]) {
                    this.peers[data.killerId].kills = (this.peers[data.killerId].kills || 0) + 1;
                }
                for (const cb of this.killBroadcastCallbacks) {
                    cb(data);
                }
                if (data.killerId === this.clientId) {
                    this.handleKillAwarded({ victimName: data.victimName, kills: this.peers[this.clientId]?.kills || 1 });
                }
            });

            onBotTick((bots) => {
                if (this.isHost || this.isServerConnected || !bots) return;
                this.localPresences = { ...bots, ...this.localPresences };
                for (const cb of this.presenceCallbacks) {
                    cb(this.localPresences);
                }
            });

            this.updateHostElection();
        } catch (err) {
            console.warn('[WebsimSocket] P2P Room init error:', err);
        }
    }

    updateHostElection() {
        const allPeerIds = [this.clientId, ...Object.keys(this.peers)].sort();
        const shouldBeHost = allPeerIds[0] === this.clientId;

        if (shouldBeHost && !this.isHost) {
            this.isHost = true;
            this.startBotSimulation();
        } else if (!shouldBeHost && this.isHost) {
            this.isHost = false;
            this.stopBotSimulation();
        }
    }

    startBotSimulation() {
        if (this.botSimulationInterval) return;

        this.botSimulationInterval = setInterval(() => {
            if (this.isServerConnected) return;

            const now = Date.now();
            const formattedBots = {};

            for (const bot of this.serverBots) {
                if (!bot.isAlive) {
                    if (bot.respawnTime > 0 && now >= bot.respawnTime) {
                        bot.isAlive = true;
                        bot.health = 100;
                        bot.x = 400 + Math.random() * 1700;
                        bot.y = 400 + Math.random() * 1700;
                        bot.angle = Math.random() * Math.PI * 2;
                        bot.targetAngle = bot.angle;
                        bot.segments = this.createBotSegments(bot.type, bot.x, bot.y, bot.angle);
                    }
                    continue;
                }

                // AI Steering
                bot.turnTimer += 50;
                let nearestDist = 800;
                let targetX = -1;
                let targetY = -1;

                for (const p of Object.values(this.localPresences)) {
                    if (p && p.isAlive && !p.id?.startsWith('ai-') && p.x !== undefined && p.y !== undefined) {
                        const d = Math.hypot(p.x - bot.x, p.y - bot.y);
                        if (d < nearestDist) {
                            nearestDist = d;
                            targetX = p.x;
                            targetY = p.y;
                        }
                    }
                }

                if (targetX !== -1 && targetY !== -1) {
                    bot.targetAngle = Math.atan2(targetY - bot.y, targetX - bot.x);
                } else if (bot.turnTimer > 2000) {
                    bot.turnTimer = 0;
                    bot.targetAngle += (Math.random() - 0.5) * 1.2;
                }

                let angleDiff = bot.targetAngle - bot.angle;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                bot.angle += Math.max(-0.08, Math.min(0.08, angleDiff));

                const margin = 200;
                if (bot.x < margin) bot.targetAngle = 0;
                else if (bot.x > 2500 - margin) bot.targetAngle = Math.PI;
                else if (bot.y < margin) bot.targetAngle = Math.PI / 2;
                else if (bot.y > 2500 - margin) bot.targetAngle = -Math.PI / 2;

                bot.x += Math.cos(bot.angle) * bot.speed;
                bot.y += Math.sin(bot.angle) * bot.speed;
                bot.x = Math.max(100, Math.min(2400, bot.x));
                bot.y = Math.max(100, Math.min(2400, bot.y));

                bot.segments[0].x = bot.x;
                bot.segments[0].y = bot.y;
                bot.segments[0].angle = bot.angle;

                for (let i = 1; i < bot.segments.length; i++) {
                    const prev = bot.segments[i - 1];
                    const cur = bot.segments[i];
                    const dx = prev.x - cur.x;
                    const dy = prev.y - cur.y;
                    const ang = Math.atan2(dy, dx);
                    cur.x = prev.x - Math.cos(ang) * 13;
                    cur.y = prev.y - Math.sin(ang) * 13;
                    cur.angle = ang;
                }

                formattedBots[bot.id] = {
                    id: bot.id,
                    name: bot.name,
                    type: bot.type,
                    skinId: bot.skinId,
                    color: bot.color,
                    x: bot.x,
                    y: bot.y,
                    angle: bot.angle,
                    segments: bot.segments,
                    health: bot.health,
                    maxHealth: bot.maxHealth,
                    kills: bot.kills,
                    isAlive: bot.isAlive,
                    isDashing: false,
                    staminaReady: true,
                    stamina: 1.0
                };
            }

            this.localPresences = { ...formattedBots, ...this.localPresences };
            if (this.actions?.sendBotTick) {
                this.actions.sendBotTick(formattedBots);
            }
            for (const cb of this.presenceCallbacks) {
                cb(this.localPresences);
            }
        }, 50);
    }

    stopBotSimulation() {
        if (this.botSimulationInterval) {
            clearInterval(this.botSimulationInterval);
            this.botSimulationInterval = null;
        }
    }

    handleIncomingDamage(data) {
        for (const cb of this.damageCallbacks) cb(data);
        if (typeof window !== 'undefined' && window.game && window.game.healthSystem) {
            window.game.healthSystem.processDamage(
                data.hitType || 'bodyHit',
                data.damage || 20,
                data.attackerId
            );
            if (data.knockbackAngle !== undefined && window.game.creature && window.game.creature.velocity) {
                const force = data.knockbackForce || 5;
                window.game.creature.velocity.x += Math.cos(data.knockbackAngle) * force;
                window.game.creature.velocity.y += Math.sin(data.knockbackAngle) * force;
            }
        }
    }

    handleKillAwarded(data) {
        for (const cb of this.killAwardedCallbacks) cb(data);
        if (typeof window !== 'undefined' && window.game && window.game.creature) {
            window.game.creature.kills = data.kills;
            if (this.peers[this.clientId]) {
                this.peers[this.clientId].kills = data.kills;
            }
            if (window.game.playerStats) {
                window.game.playerStats.updateCurrentKills(data.kills);
            }
            if (window.game.skinUnlockSystem && window.game.creature.type) {
                window.game.skinUnlockSystem.trackKill(window.game.creature.type);
            }
        }
    }

    notifyStatus() {
        const count = Math.max(1, Object.keys(this.peers).length);
        const isOnline = this.isServerConnected || this.isP2PConnected || count > 1 || this.trysteroRoom !== null;
        const status = {
            connected: isOnline,
            connecting: false,
            playersCount: count,
            peers: this.peers
        };
        for (const cb of this.statusCallbacks) {
            cb(status);
        }
    }

    subscribeStatus(callback) {
        this.statusCallbacks.push(callback);
        this.notifyStatus();
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    subscribeDamage(callback) {
        this.damageCallbacks.push(callback);
    }

    subscribeKillBroadcast(callback) {
        this.killBroadcastCallbacks.push(callback);
    }

    subscribeKillAwarded(callback) {
        this.killAwardedCallbacks.push(callback);
    }

    updatePresence(data) {
        if (!data) return;
        this.localPresences[this.clientId] = data;

        const now = performance.now();
        if (now - this.lastPresenceEmit >= 33) {
            this.lastPresenceEmit = now;
            if (this.socket && this.socket.connected) {
                this.socket.emit('updatePresence', data);
            }
            if (this.actions?.sendPresence) {
                this.actions.sendPresence(data);
            }
        }
    }

    attackPlayer(targetId, damage, hitType = 'bodyHit', angle = 0, knockbackForce = 6) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackPlayer', { targetId, damage, hitType, angle, knockbackForce });
        }
        if (this.actions?.sendAttackPlayer) {
            this.actions.sendAttackPlayer({ targetId, damage, hitType, angle, knockbackForce }, targetId);
        }
    }

    attackBot(botId, damage, hitType = 'bodyHit', angle = 0) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackBot', { botId, damage, hitType, angle });
        } else if (this.isHost) {
            const bot = this.serverBots.find(b => b.id === botId);
            if (!bot || !bot.isAlive) return;
            bot.health -= (damage || 25);
            if (bot.health <= 0) {
                bot.health = 0;
                bot.isAlive = false;
                bot.respawnTime = Date.now() + 5000;
                if (this.peers[this.clientId]) {
                    this.peers[this.clientId].kills = (this.peers[this.clientId].kills || 0) + 1;
                    const kills = this.peers[this.clientId].kills;
                    const broadcast = {
                        killerId: this.clientId,
                        killerName: this.username,
                        victimId: bot.id,
                        victimName: bot.name
                    };
                    if (this.actions?.sendKillBroadcast) this.actions.sendKillBroadcast(broadcast);
                    for (const cb of this.killBroadcastCallbacks) cb(broadcast);
                    this.handleKillAwarded({ victimName: bot.name, kills });
                }
            }
        } else if (this.actions?.sendAttackBot) {
            this.actions.sendAttackBot({ botId, damage, hitType, angle });
        }
    }

    notifyDeath(killerId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerDied', { killerId });
        } else if (this.actions?.sendKillBroadcast) {
            const killerName = (killerId && this.peers[killerId]?.username) || 'Ocean';
            const broadcast = {
                killerId: killerId || null,
                killerName,
                victimId: this.clientId,
                victimName: this.username
            };
            this.actions.sendKillBroadcast(broadcast);
            for (const cb of this.killBroadcastCallbacks) cb(broadcast);
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('requestPresenceUpdate', { targetId, updateRequest });
        }
    }

    setUsername(newUsername) {
        let clean = String(newUsername || "").trim().substring(0, 16);
        if (!clean) clean = "Player";
        this.username = clean;
        try { localStorage.setItem('username', clean); } catch (e) {}
        if (this.peers[this.clientId]) {
            this.peers[this.clientId].username = clean;
        }
        if (this.socket && this.socket.connected) {
            this.socket.emit('setUsername', { username: clean });
        }
        if (this.actions?.sendPeerInfo) {
            this.actions.sendPeerInfo({
                id: this.clientId,
                username: clean,
                kills: this.peers[this.clientId]?.kills || 0
            });
        }
        this.notifyStatus();
    }

    updateRoomState(data) {
        this.roomState = { ...this.roomState, ...data };
        try {
            localStorage.setItem('narwhal_room_state', JSON.stringify(this.roomState));
        } catch (e) {}

        if (this.socket && this.socket.connected) {
            this.socket.emit('updateRoomState', data);
        }
    }
}
