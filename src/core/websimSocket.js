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
        this.channel = null;
        this.isServerConnected = false;

        // Try to load cached room state from localStorage (persists leaderboard on Vercel/offline)
        try {
            const saved = localStorage.getItem('narwhal_room_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.roomState = { ...this.roomState, ...parsed };
                }
            }
        } catch (e) {
            // Ignore JSON parse errors
        }
    }

    async initialize() {
        return new Promise((resolve) => {
            let resolved = false;
            const completeInit = () => {
                if (resolved) return;
                resolved = true;
                resolve();
            };

            // Retrieve username from local storage or create a fallback
            let username = null;
            try {
                username = localStorage.getItem('username');
            } catch (e) {}
            
            if (!username) {
                username = "Player_" + Math.floor(Math.random() * 1000);
                try {
                    localStorage.setItem('username', username);
                } catch (e) {}
            }

            // Always populate local peer info immediately so game can start even if offline or on Vercel
            this.peers[this.clientId] = { id: this.clientId, username };

            // Setup cross-tab sync via BroadcastChannel (works on modern browsers, 100% offline & Vercel compatible)
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
                        } else if (msg.type === 'peerSync' && msg.peer) {
                            this.peers[msg.peer.id] = msg.peer;
                            if (msg.presence) {
                                this.localPresences[msg.peer.id] = msg.presence;
                                for (const cb of this.presenceCallbacks) {
                                    cb({ ...this.localPresences });
                                }
                            }
                        } else if (msg.type === 'peerLeft' && msg.id) {
                            delete this.peers[msg.id];
                            delete this.localPresences[msg.id];
                            for (const cb of this.presenceCallbacks) {
                                cb({ ...this.localPresences });
                            }
                        } else if (msg.type === 'presence' && msg.clientId && msg.data) {
                            this.localPresences[msg.clientId] = msg.data;
                            for (const cb of this.presenceCallbacks) {
                                cb({ ...this.localPresences });
                            }
                        } else if (msg.type === 'presenceUpdateRequest' && msg.targetId === this.clientId) {
                            for (const cb of this.presenceRequestCallbacks) {
                                cb(msg.updateRequest, msg.fromClientId);
                            }
                        } else if (msg.type === 'roomStateUpdate' && msg.data) {
                            this.roomState = { ...this.roomState, ...msg.data };
                        }
                    };

                    this.channel.postMessage({
                        type: 'peerJoined',
                        peer: this.peers[this.clientId]
                    });

                    window.addEventListener('beforeunload', () => {
                        if (this.channel) {
                            this.channel.postMessage({ type: 'peerLeft', id: this.clientId });
                        }
                    });
                } catch (e) {
                    console.warn('[WebsimSocket] BroadcastChannel not available:', e);
                }
            }

            // Fallback timer: If socket does not connect within 1s (e.g. on static Vercel deployment), start immediately!
            const timeoutId = setTimeout(() => {
                if (!this.isServerConnected) {
                    completeInit();
                }
            }, 1000);

            // Attempt to connect to Socket.IO backend if one exists (e.g. full-stack server)
            try {
                this.socket = io({
                    auth: { username },
                    timeout: 800,
                    reconnectionAttempts: 2,
                    transports: ['websocket', 'polling']
                });

                this.socket.on('init', (data) => {
                    this.isServerConnected = true;
                    clearTimeout(timeoutId);
                    if (data.id) this.clientId = data.id;
                    if (data.roomState) this.roomState = data.roomState;
                    if (data.peers) this.peers = data.peers;
                    completeInit();
                });

                this.socket.on('peerJoined', (peer) => {
                    this.peers[peer.id] = peer;
                });

                this.socket.on('peerLeft', (id) => {
                    delete this.peers[id];
                    delete this.localPresences[id];
                });

                this.socket.on('presence', (presences) => {
                    this.localPresences = { ...presences };
                    for (const cb of this.presenceCallbacks) {
                        cb(presences);
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

                this.socket.on('connect_error', () => {
                    // Fail gracefully on static hosting (Vercel) without blocking game startup
                    if (!this.isServerConnected) {
                        completeInit();
                    }
                });
            } catch (err) {
                completeInit();
            }
        });
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    updatePresence(data) {
        if (data) {
            this.localPresences[this.clientId] = data;
        }
        if (this.socket && this.isServerConnected && this.socket.connected) {
            this.socket.emit('updatePresence', data);
        } else if (this.channel && data) {
            this.channel.postMessage({
                type: 'presence',
                clientId: this.clientId,
                data
            });
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.socket && this.isServerConnected && this.socket.connected) {
            this.socket.emit('requestPresenceUpdate', { targetId, updateRequest });
        } else if (this.channel) {
            this.channel.postMessage({
                type: 'presenceUpdateRequest',
                targetId,
                updateRequest,
                fromClientId: this.clientId
            });
        }
    }

    updateRoomState(data) {
        this.roomState = { ...this.roomState, ...data };
        try {
            localStorage.setItem('narwhal_room_state', JSON.stringify(this.roomState));
        } catch (e) {}

        if (this.socket && this.isServerConnected && this.socket.connected) {
            this.socket.emit('updateRoomState', data);
        } else if (this.channel) {
            this.channel.postMessage({
                type: 'roomStateUpdate',
                data
            });
        }
    }
}
