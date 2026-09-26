import { io } from "socket.io-client";

export class WebsimSocket {
    constructor() {
        this.socket = null;
        this.clientId = null;
        this.peers = {};
        this.roomState = {};
        this.presenceCallbacks = [];
        this.presenceRequestCallbacks = [];
    }

    async initialize() {
        return new Promise((resolve) => {
            // Retrieve username from local storage or prompt for one
            const storedName = localStorage.getItem('username');
            let username = storedName;
            
            if (!username) {
                username = "Player_" + Math.floor(Math.random() * 1000);
                localStorage.setItem('username', username);
            }

            this.socket = io({
                auth: { username }
            });

            this.socket.on('init', (data) => {
                this.clientId = data.id;
                this.roomState = data.roomState;
                this.peers = data.peers;
                resolve();
            });

            this.socket.on('peerJoined', (peer) => {
                this.peers[peer.id] = peer;
            });

            this.socket.on('peerLeft', (id) => {
                delete this.peers[id];
            });

            this.socket.on('presence', (presences) => {
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
        });
    }

    subscribePresence(callback) {
        this.presenceCallbacks.push(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceRequestCallbacks.push(callback);
    }

    updatePresence(data) {
        if (this.socket) {
            this.socket.emit('updatePresence', data);
        }
    }

    requestPresenceUpdate(targetId, updateRequest) {
        if (this.socket) {
            this.socket.emit('requestPresenceUpdate', { targetId, updateRequest });
        }
    }

    updateRoomState(data) {
        if (this.socket) {
            this.socket.emit('updateRoomState', data);
        }
    }
}
