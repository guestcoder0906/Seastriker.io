export class GlobalLeaderboardService {
    constructor(game) {
        this.game = game;
        this.initialized = false;
        this.leaderboardCache = null;
        this.setupSocketListener();
    }
    
    setupSocketListener() {
        if (this.game && this.game.room && this.game.room.socket) {
            this.game.room.socket.on('leaderboardUpdate', (data) => {
                if (data) {
                    this.leaderboardCache = data;
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = data;
                    }
                    if (this.game.statsScreen && this.game.statsScreen.container.style.display !== 'none') {
                        this.game.statsScreen.updateLeaderboard();
                    }
                }
            });
        }
    }
    
    async initialize() {
        if (this.initialized) return;
        this.setupSocketListener();
        this.initialized = true;
    }
    
    async fetchGlobalLeaderboard() {
        await this.initialize();
        
        // 1. Try fetching from server REST API
        try {
            const res = await fetch('/api/leaderboard');
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.bestKills) && Array.isArray(data.totalKills)) {
                    this.leaderboardCache = data;
                    try {
                        localStorage.setItem('cached_global_leaderboard', JSON.stringify(data));
                    } catch (e) {}
                    return data;
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] API fetch failed, trying fallback:', err);
        }
        
        // 2. Try socket room state
        if (this.game.room && this.game.room.roomState && this.game.room.roomState.globalLeaderboard) {
            const formatted = this._formatLeaderboardData(this.game.room.roomState.globalLeaderboard);
            this.leaderboardCache = formatted;
            return formatted;
        }
        
        // 3. Try localStorage cache
        try {
            const saved = localStorage.getItem('cached_global_leaderboard');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && Array.isArray(parsed.bestKills)) {
                    this.leaderboardCache = parsed;
                    return parsed;
                }
            }
        } catch (e) {}
        
        // 4. Fallback defaults if offline
        const fallback = {
            bestKills: [
                { username: "ApexPredator", score: 24 },
                { username: "KrakenKing", score: 19 },
                { username: "AbyssalGhost", score: 16 },
                { username: "ViperFish", score: 13 },
                { username: "TsunamiRider", score: 11 },
                { username: "ShadowFin", score: 9 },
                { username: "CoralSniper", score: 7 },
                { username: "DeepBlue", score: 5 }
            ],
            totalKills: [
                { username: "ApexPredator", score: 142 },
                { username: "KrakenKing", score: 118 },
                { username: "AbyssalGhost", score: 85 },
                { username: "ShadowFin", score: 64 },
                { username: "ViperFish", score: 58 },
                { username: "TsunamiRider", score: 45 },
                { username: "CoralSniper", score: 37 },
                { username: "DeepBlue", score: 29 }
            ]
        };
        this.leaderboardCache = fallback;
        return fallback;
    }
    
    _formatLeaderboardData(leaderboardData) {
        const formattedData = {
            bestKills: [],
            totalKills: []
        };
        
        if (leaderboardData.bestKills) {
            for (const username in leaderboardData.bestKills) {
                formattedData.bestKills.push({
                    username: username,
                    score: Number(leaderboardData.bestKills[username]) || 0
                });
            }
            formattedData.bestKills.sort((a, b) => b.score - a.score);
        }
        
        if (leaderboardData.totalKills) {
            for (const username in leaderboardData.totalKills) {
                formattedData.totalKills.push({
                    username: username,
                    score: Number(leaderboardData.totalKills[username]) || 0
                });
            }
            formattedData.totalKills.sort((a, b) => b.score - a.score);
        }
        
        return formattedData;
    }
    
    async submitScore(username, bestKills, totalKills) {
        if (!username) return false;
        
        const payload = {
            username: username.trim(),
            bestKills: Math.max(0, parseInt(bestKills, 10) || 0),
            totalKills: Math.max(0, parseInt(totalKills, 10) || 0)
        };
        
        // 1. Submit via REST API
        try {
            const res = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.leaderboard) {
                    this.leaderboardCache = data.leaderboard;
                    if (this.game.globalLeaderboardManager) {
                        this.game.globalLeaderboardManager.leaderboardData = data.leaderboard;
                    }
                    return true;
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] API submit failed, using socket:', err);
        }
        
        // 2. Emit via socket
        if (this.game.room && this.game.room.socket && this.game.room.isServerConnected) {
            this.game.room.socket.emit('submitScore', payload);
            return true;
        }
        
        // 3. Fallback to roomState update
        if (this.game.room) {
            this.game.room.updateRoomState({
                globalLeaderboard: {
                    bestKills: { [payload.username]: payload.bestKills },
                    totalKills: { [payload.username]: payload.totalKills }
                }
            });
        }
        
        return true;
    }
}
