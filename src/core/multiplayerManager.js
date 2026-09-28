import { SupabaseRealtimeManager } from './supabaseManager.js';
import { io } from 'socket.io-client';

export class MultiplayerManager {
    constructor() {
        this.supabase = new SupabaseRealtimeManager();
        this.clientId = this.supabase.clientId;
        this.gameMode = this.loadInitialGameMode(); // 'multiplayer' by default (like on seastriker.io)
        
        this.socket = null;
        this.channel = null;
        this._isServerConnected = false;
        this._lastLocalBroadcast = 0;
        this._lastSocketBroadcast = 0;
        
        this.peers = { ...this.supabase.peers };
        this.localPresences = {};
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
        this.killFeedCallbacks = [];
        
        this.roomState = {
            globalLeaderboard: {
                bestKills: {},
                totalKills: {}
            }
        };

        // Cache room state from localStorage
        try {
            const saved = localStorage.getItem('narwhal_room_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.roomState = { ...this.roomState, ...parsed };
                }
            }
        } catch (e) {}

        // Setup cross-tab sync via BroadcastChannel (works on modern browsers, 100% offline & Vercel compatible)
        this.setupBroadcastChannel();

        // Forward callbacks from Supabase Realtime
        this.supabase.subscribePresence((remotePresences) => {
            if (this.gameMode === 'multiplayer') {
                const updated = {};
                if (this.localPresences[this.clientId]) {
                    updated[this.clientId] = this.localPresences[this.clientId];
                }
                for (const [key, pres] of Object.entries(remotePresences)) {
                    if (key !== this.clientId) {
                        updated[key] = pres;
                    }
                }
                this.localPresences = updated;
                this.peers = { ...this.peers, ...this.supabase.peers };
                this.notifyPresence();
            }
        });

        this.supabase.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
            if (this.gameMode === 'multiplayer') {
                for (const cb of this.presenceRequestCallbacks) {
                    cb(updateRequest, fromClientId);
                }
            }
        });

        this.supabase.subscribeAnnouncements((announcement) => {
            for (const cb of this.killFeedCallbacks) {
                cb(announcement);
            }
        });
    }

    setupBroadcastChannel() {
        if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
        try {
            this.channel = new BroadcastChannel('sea_striker_network');
            this.channel.onmessage = (event) => {
                const msg = event.data;
                if (!msg || typeof msg !== 'object') return;

                if (msg.type === 'peerJoined' && msg.peer) {
                    this.peers[msg.peer.id] = msg.peer;
                    if (msg.peer.id !== this.clientId && this.localPresences[this.clientId]) {
                        this.channel.postMessage({
                            type: 'peerSync',
                            peer: this.peers[this.clientId],
                            presence: this.localPresences[this.clientId]
                        });
                    }
                } else if (msg.type === 'peerSync' && msg.peer) {
                    this.peers[msg.peer.id] = msg.peer;
                    if (msg.presence) {
                        this.localPresences[msg.peer.id] = msg.presence;
                        this.notifyPresence();
                    }
                } else if (msg.type === 'peerLeft' && msg.id) {
                    delete this.peers[msg.id];
                    delete this.localPresences[msg.id];
                    this.notifyPresence();
                } else if (msg.type === 'presence' && msg.clientId && msg.data) {
                    if (msg.clientId !== this.clientId) {
                        const existing = this.localPresences[msg.clientId];
                        if (existing && existing.t && msg.t) {
                            if (msg.t < existing.t && (existing.t - msg.t) < 1200) {
                                return; // drop delayed duplicate packet
                            }
                        }
                        if (msg.t) msg.data.t = msg.t;
                        this.localPresences[msg.clientId] = msg.data;
                        if (msg.data.name && !this.peers[msg.clientId]) {
                            this.peers[msg.clientId] = { id: msg.clientId, username: msg.data.name };
                        }
                        this.notifyPresence();
                    }
                } else if (msg.type === 'presenceUpdateRequest' && msg.targetId === this.clientId) {
                    for (const cb of this.presenceRequestCallbacks) {
                        cb(msg.updateRequest, msg.fromClientId);
                    }
                } else if (msg.type === 'damagePlayer' && msg.targetId === this.clientId) {
                    if (typeof window !== 'undefined' && window.game && window.game.healthSystem) {
                        window.game.healthSystem.processDamage(
                            msg.hitType || 'bodyHit',
                            msg.damage || 20,
                            msg.attackerId
                        );
                    }
                } else if (msg.type === 'roomStateUpdate' && msg.data) {
                    this.roomState = { ...this.roomState, ...msg.data };
                }
            };

            this.channel.postMessage({
                type: 'peerJoined',
                peer: { id: this.clientId, username: this.supabase.username }
            });

            window.addEventListener('beforeunload', () => {
                if (this.channel) {
                    this.channel.postMessage({ type: 'peerLeft', id: this.clientId });
                }
            });
        } catch (e) {
            console.warn('[BroadcastChannel] Initialization failed:', e);
        }
    }

    loadInitialGameMode() {
        try {
            const saved = localStorage.getItem('sea_striker_game_mode');
            if (saved === 'multiplayer' || saved === 'singleplayer') {
                return saved;
            }
        } catch (e) {}
        // Default to multiplayer just like seastriker.io on Vercel
        return 'multiplayer';
    }

    setGameMode(mode) {
        if (mode !== 'singleplayer' && mode !== 'multiplayer') return;
        this.gameMode = mode;
        try {
            localStorage.setItem('sea_striker_game_mode', mode);
        } catch (e) {}

        if (mode === 'singleplayer') {
            this.supabase.disconnect();
            this.peers = {
                [this.clientId]: { id: this.clientId, username: this.supabase.username }
            };
            this.localPresences = {};
            this.notifyPresence();
        } else if (mode === 'multiplayer') {
            this.supabase.connect();
            if (this.channel) {
                this.channel.postMessage({
                    type: 'peerJoined',
                    peer: { id: this.clientId, username: this.supabase.username }
                });
            }
        }
    }

    get isServerConnected() {
        if (this.gameMode === 'singleplayer') return false;
        return Boolean(this._isServerConnected || this.supabase.connectionStatus === 'connected' || (this.socket && this.socket.connected));
    }

    set isServerConnected(val) {
        this._isServerConnected = Boolean(val);
    }

    get connectionStatus() {
        if (this.gameMode === 'singleplayer') return 'singleplayer';
        return this.supabase.connectionStatus;
    }

    get pingMs() {
        return this.supabase.pingMs;
    }

    async initialize() {
        const username = this.supabase.username;
        this.peers[this.clientId] = { id: this.clientId, username };

        // 1. Connect to Supabase Realtime channel in the background
        if (this.gameMode === 'multiplayer') {
            this.supabase.connect().catch(() => {});
        }

        // 2. Try connecting to Node Socket.IO backend if one is running
        try {
            this.socket = io({
                auth: { username, clientId: this.clientId },
                timeout: 1000,
                reconnectionAttempts: 3,
                transports: ['websocket', 'polling']
            });

            this.socket.on('init', (data) => {
                this.isServerConnected = true;
                if (data.roomState) this.roomState = data.roomState;
                if (data.peers) this.peers = { ...this.peers, ...data.peers };
            });

            this.socket.on('takeDamage', (data) => {
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

            this.socket.on('peerJoined', (peer) => {
                this.peers[peer.id] = peer;
            });

            this.socket.on('peerLeft', (id) => {
                delete this.peers[id];
                delete this.localPresences[id];
                this.notifyPresence();
            });

            this.socket.on('presence', (presences) => {
                if (this.gameMode === 'multiplayer') {
                    for (const [id, p] of Object.entries(presences)) {
                        if (id !== this.clientId) {
                            this.localPresences[id] = p;
                        }
                    }
                    this.notifyPresence();
                }
            });

            this.socket.on('presenceUpdateRequest', (data) => {
                if (this.gameMode === 'multiplayer') {
                    for (const cb of this.presenceRequestCallbacks) {
                        cb(data.updateRequest, data.fromClientId);
                    }
                }
            });

            this.socket.on('roomStateUpdate', (data) => {
                this.roomState = data;
            });
        } catch (e) {
            // Fails gracefully on static hosting (Vercel)
        }

        return true;
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    subscribeKillFeed(callback) {
        this.killFeedCallbacks.push(callback);
    }

    notifyPresence() {
        for (const cb of this.presenceCallbacks) {
            cb({ ...this.localPresences });
        }
    }

    updatePresence(data) {
        if (!data) return;
        this.localPresences[this.clientId] = data;

        if (this.gameMode === 'multiplayer') {
            const now = performance.now();

            // 1. Supabase Realtime (global internet multiplayer)
            this.supabase.sendPresenceUpdate(data);

            // 2. BroadcastChannel (instant cross-tab sync on same machine / Vercel, throttled to 30ms to prevent browser event queue overload)
            if (this.channel && now - this._lastLocalBroadcast >= 30) {
                this._lastLocalBroadcast = now;
                this.channel.postMessage({
                    type: 'presence',
                    clientId: this.clientId,
                    data,
                    t: now
                });
            }

            // 3. Socket.IO (local server if connected, throttled to 30ms)
            if (this.socket && this.socket.connected && now - this._lastSocketBroadcast >= 30) {
                this._lastSocketBroadcast = now;
                this.socket.emit('updatePresence', data);
            }
        } else {
            this.notifyPresence();
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.gameMode === 'multiplayer') {
            // 1. Supabase Realtime
            this.supabase.sendCombatRequest(targetId, updateRequest);

            // 2. BroadcastChannel
            if (this.channel) {
                this.channel.postMessage({
                    type: 'presenceUpdateRequest',
                    targetId,
                    updateRequest,
                    fromClientId: this.clientId
                });
            }

            // 3. Socket.IO
            if (this.socket && this.socket.connected) {
                this.socket.emit('requestPresenceUpdate', { targetId, updateRequest });
            }
        } else {
            if (targetId && targetId === this.clientId) {
                for (const cb of this.presenceRequestCallbacks) {
                    cb(updateRequest, this.clientId);
                }
            }
        }
    }

    broadcastInkCloud(cloud) {
        if (this.gameMode === 'multiplayer') {
            this.supabase.sendInkCloud(cloud);
        }
    }

    broadcastKill(killerName, victimName) {
        if (this.gameMode === 'multiplayer') {
            this.supabase.sendKillAnnouncement(killerName, victimName);
        }
    }

    updateRoomState(data) {
        this.roomState = { ...this.roomState, ...data };
        try {
            localStorage.setItem('narwhal_room_state', JSON.stringify(this.roomState));
        } catch (e) {}

        if (this.channel) {
            this.channel.postMessage({ type: 'roomStateUpdate', data });
        }
        if (this.socket && this.socket.connected) {
            this.socket.emit('updateRoomState', data);
        }
    }

    setUsername(newUsername) {
        this.supabase.setUsername(newUsername);
        this.peers[this.clientId] = { id: this.clientId, username: newUsername };
        if (this.socket && this.socket.connected) {
            this.socket.emit('setUsername', { username: newUsername });
        }
    }
}
