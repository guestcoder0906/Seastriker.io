import { io } from "socket.io-client";

export function getSocketServerUrl() {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL) {
        return import.meta.env.VITE_SERVER_URL;
    }

    if (typeof window === 'undefined') return '';

    const host = window.location.hostname;
    // Local development or running directly on Cloud Run
    if (host === 'localhost' || host === '127.0.0.1' || host.includes('run.app')) {
        return window.location.origin;
    }

    // Deployed on Vercel (seastriker.io or *.vercel.app)
    return 'https://ais-pre-d42zus7jlzlvno34h5oag2-195196720664.us-west2.run.app';
}

export class WebsimSocket {
    constructor() {
        this.socket = null;
        this.serverUrl = getSocketServerUrl();
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
        this.isConnecting = true;
        this.channel = null;
        this.lastPresenceEmit = 0;

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

        // Set up BroadcastChannel cross-tab multiplayer sync (always active for zero-latency local / Vercel fallback)
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
                this.channel = new BroadcastChannel('sea_striker_network');
                this.channel.onmessage = (event) => {
                    const msg = event.data;
                    if (!msg || typeof msg !== 'object') return;

                    if (msg.type === 'peerJoined' && msg.peer) {
                        this.peers[msg.peer.id] = msg.peer;
                        if (msg.peer.id !== this.clientId) {
                            this.channel.postMessage({
                                type: 'peerSync',
                                peer: this.peers[this.clientId],
                                presence: this.localPresences[this.clientId]
                            });
                        }
                        this.notifyStatus();
                    } else if (msg.type === 'peerSync' && msg.peer) {
                        this.peers[msg.peer.id] = msg.peer;
                        if (msg.presence) {
                            this.localPresences[msg.peer.id] = msg.presence;
                            for (const cb of this.presenceCallbacks) {
                                cb({ ...this.localPresences });
                            }
                        }
                        this.notifyStatus();
                    } else if (msg.type === 'peerLeft' && msg.id) {
                        delete this.peers[msg.id];
                        delete this.localPresences[msg.id];
                        this.notifyStatus();
                        for (const cb of this.presenceCallbacks) {
                            cb({ ...this.localPresences });
                        }
                    } else if (msg.type === 'presence' && msg.clientId && msg.data) {
                        if (!this.isServerConnected) {
                            this.localPresences[msg.clientId] = msg.data;
                            for (const cb of this.presenceCallbacks) {
                                cb({ ...this.localPresences });
                            }
                        }
                    } else if (msg.type === 'takeDamage' && msg.targetId === this.clientId) {
                        for (const cb of this.damageCallbacks) {
                            cb(msg);
                        }
                    } else if (msg.type === 'killBroadcast' && !this.isServerConnected) {
                        for (const cb of this.killBroadcastCallbacks) {
                            cb(msg.data);
                        }
                    }
                };

                window.addEventListener('beforeunload', () => {
                    if (this.channel) {
                        this.channel.postMessage({ type: 'peerLeft', id: this.clientId });
                    }
                });
            } catch (e) {
                console.warn('[WebsimSocket] BroadcastChannel not supported:', e);
            }
        }
    }

    async initialize() {
        return new Promise((resolve) => {
            let resolved = false;
            const completeInit = () => {
                if (resolved) return;
                resolved = true;
                this.isConnecting = false;
                this.notifyStatus();
                resolve();
            };

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

            if (this.channel) {
                this.channel.postMessage({
                    type: 'peerJoined',
                    peer: this.peers[this.clientId]
                });
            }

            // Connection timeout: after 2 seconds on Vercel, don't keep user waiting on "Connecting..."
            const connectionTimeout = setTimeout(() => {
                if (!this.isServerConnected) {
                    completeInit();
                }
            }, 2000);

            try {
                this.socket = io(this.serverUrl, {
                    auth: { username },
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 10,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 4000,
                    timeout: 4000
                });

                this.socket.on('connect', () => {
                    clearTimeout(connectionTimeout);
                    this.isServerConnected = true;
                    this.isConnecting = false;
                    if (this.socket.id) {
                        this.clientId = this.socket.id;
                        if (typeof window !== 'undefined' && window.game && window.game.creature) {
                            window.game.creature.id = this.clientId;
                        }
                    }
                    this.notifyStatus();
                    this.socket.emit('setUsername', { username });
                    completeInit();
                });

                this.socket.on('init', (data) => {
                    clearTimeout(connectionTimeout);
                    this.isServerConnected = true;
                    this.isConnecting = false;
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
                    this.notifyStatus();
                    completeInit();
                });

                // Authoritative 20Hz network tick from server
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

                    this.notifyStatus();
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
                    this.notifyStatus();
                });

                this.socket.on('peerLeft', (id) => {
                    delete this.peers[id];
                    delete this.localPresences[id];
                    this.notifyStatus();
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
                    this.notifyStatus();
                });

                this.socket.on('connect_error', () => {
                    this.isServerConnected = false;
                    this.notifyStatus();
                    completeInit();
                });
            } catch (err) {
                console.warn("[WebsimSocket] Socket connect error:", err);
                completeInit();
            }

            setTimeout(completeInit, 2000);
        });
    }

    notifyStatus() {
        const count = Math.max(1, Object.keys(this.peers).length);
        const status = {
            connected: this.isServerConnected,
            connecting: this.isConnecting,
            playersCount: count,
            peers: this.peers
        };
        for (const cb of this.statusCallbacks) {
            cb(status);
        }
    }

    subscribeStatus(callback) {
        this.statusCallbacks.push(callback);
        callback({
            connected: this.isServerConnected,
            connecting: this.isConnecting,
            playersCount: Math.max(1, Object.keys(this.peers).length),
            peers: this.peers
        });
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
            } else if (this.channel) {
                this.channel.postMessage({
                    type: 'presence',
                    clientId: this.clientId,
                    data
                });
            }
        }
    }

    attackPlayer(targetId, damage, hitType = 'bodyHit', angle = 0, knockbackForce = 6) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('attackPlayer', { targetId, damage, hitType, angle, knockbackForce });
        } else if (this.channel) {
            this.channel.postMessage({
                type: 'takeDamage',
                targetId,
                attackerId: this.clientId,
                attackerName: this.peers[this.clientId]?.username || 'Player',
                damage,
                hitType,
                knockbackAngle: angle,
                knockbackForce
            });
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
