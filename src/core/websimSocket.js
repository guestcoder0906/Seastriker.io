import { io } from "socket.io-client";

export class WebsimSocket {
    constructor() {
        this.socket = null;
        this.clientId = "player_" + Math.random().toString(36).substring(2, 9);
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
        this.lastPresenceEmit = 0;
        this.pendingPresenceData = null;

        // Try to load cached room state from localStorage
        try {
            const saved = localStorage.getItem('narwhal_room_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.roomState = { ...this.roomState, ...parsed };
                }
            }
        } catch (e) {}
    }

    async initialize() {
        return new Promise((resolve) => {
            let username = null;
            try {
                username = localStorage.getItem('username');
            } catch (e) {}
            
            if (!username) {
                username = "Player_" + Math.floor(100 + Math.random() * 900);
                try {
                    localStorage.setItem('username', username);
                } catch (e) {}
            }

            this.peers[this.clientId] = { id: this.clientId, username, kills: 0 };

            try {
                this.socket = io({
                    auth: { username },
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });

                this.socket.on('connect', () => {
                    this.isServerConnected = true;
                    if (this.socket.id) {
                        this.clientId = this.socket.id;
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    this.notifyStatus(true);
                    this.socket.emit('setUsername', { username });
                    resolve();
                });

                this.socket.on('init', (data) => {
                    this.isServerConnected = true;
                    if (data.id) {
                        this.clientId = data.id;
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    if (data.roomState) this.roomState = data.roomState;
                    if (data.peers) this.peers = data.peers;
                    if (data.bots) {
                        this.localPresences = { ...data.bots, ...this.localPresences };
                    }
                    this.notifyStatus(true);
                    resolve();
                });

                // 20Hz network tick from server (authoritative positions of players and bots)
                this.socket.on('networkTick', (data) => {
                    if (!data) return;
                    if (data.peers) {
                        this.peers = data.peers;
                    }
                    
                    const combined = {
                        ...(data.bots || {}),
                        ...(data.players || {})
                    };

                    this.localPresences = combined;

                    for (const cb of this.presenceCallbacks) {
                        cb(combined);
                    }

                    this.notifyStatus(this.isServerConnected);
                });

                this.socket.on('presence', (presences) => {
                    this.localPresences = { ...this.localPresences, ...presences };
                    for (const cb of this.presenceCallbacks) {
                        cb(this.localPresences);
                    }
                });

                this.socket.on('takeDamage', (data) => {
                    for (const cb of this.damageCallbacks) {
                        cb(data);
                    }
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
                });

                this.socket.on('killBroadcast', (data) => {
                    for (const cb of this.killBroadcastCallbacks) {
                        cb(data);
                    }
                });

                this.socket.on('killAwarded', (data) => {
                    for (const cb of this.killAwardedCallbacks) {
                        cb(data);
                    }
                    if (typeof window !== 'undefined' && window.game && window.game.creature) {
                        window.game.creature.kills = data.kills;
                        if (window.game.playerStats) {
                            window.game.playerStats.updateCurrentKills(data.kills);
                        }
                        if (window.game.skinUnlockSystem && window.game.creature.type) {
                            window.game.skinUnlockSystem.trackKill(window.game.creature.type);
                        }
                    }
                });

                this.socket.on('peerJoined', (peer) => {
                    this.peers[peer.id] = peer;
                    this.notifyStatus(true);
                });

                this.socket.on('peerLeft', (id) => {
                    delete this.peers[id];
                    delete this.localPresences[id];
                    this.notifyStatus(true);
                    for (const cb of this.presenceCallbacks) {
                        cb(this.localPresences);
                    }
                });

                this.socket.on('presenceUpdateRequest', (data) => {
                    for (const cb of this.presenceRequestCallbacks) {
                        cb(data.updateRequest, data.fromClientId);
                    }
                });

                this.socket.on('roomStateUpdate', (data) => {
                    this.roomState = data;
                });

                this.socket.on('disconnect', () => {
                    this.isServerConnected = false;
                    this.notifyStatus(false);
                });

                this.socket.on('connect_error', () => {
                    this.isServerConnected = false;
                    this.notifyStatus(false);
                    // Resolve promise anyway so game UI renders and reconnects in background
                    resolve();
                });
            } catch (err) {
                console.error("[WebsimSocket] Init error:", err);
                resolve();
            }

            // Safety timeout to ensure game never hangs on load
            setTimeout(() => {
                resolve();
            }, 1500);
        });
    }

    notifyStatus(connected) {
        const count = Object.keys(this.peers).length;
        for (const cb of this.statusCallbacks) {
            cb({ connected, playersCount: count, peers: this.peers });
        }
    }

    subscribeStatus(callback) {
        this.statusCallbacks.push(callback);
        callback({ connected: this.isServerConnected, playersCount: Object.keys(this.peers).length, peers: this.peers });
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

        // Throttle emissions to ~30 FPS (every 33ms) to avoid saturating network
        const now = performance.now();
        if (now - this.lastPresenceEmit >= 33) {
            this.lastPresenceEmit = now;
            if (this.socket && this.socket.connected) {
                this.socket.emit('updatePresence', data);
            }
        }
    }

    attackPlayer(targetId, damage, hitType = 'bodyHit', angle = 0, knockbackForce = 6) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackPlayer', { targetId, damage, hitType, angle, knockbackForce });
        }
    }

    attackBot(botId, damage, hitType = 'bodyHit', angle = 0) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackBot', { botId, damage, hitType, angle });
        }
    }

    notifyDeath(killerId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerDied', { killerId });
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('requestPresenceUpdate', { targetId, updateRequest });
        }
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
