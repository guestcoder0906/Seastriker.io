export class GlobalLeaderboardService {
    constructor(game) {
        this.game = game;
        this.initialized = false;
        this.leaderboardCache = null;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        // Make sure room is initialized
        if (!this.game.room || !this.game.room.roomState) {
            console.error("Room not initialized");
            return;
        }
        
        // Wait for room state to be fully loaded
        await this._waitForRoomState();
        
        // Initialize leaderboard in room state if it doesn't exist or restore from cache
        if (!this.game.room.roomState.globalLeaderboard) {
            await this.game.room.updateRoomState({
                globalLeaderboard: this.leaderboardCache || {
                    bestKills: {},
                    totalKills: {}
                }
            });
        } else {
            // Save a cache of the current leaderboard data
            this.leaderboardCache = JSON.parse(JSON.stringify(this.game.room.roomState.globalLeaderboard));
        }
        
        // Start a periodic backup of leaderboard data to ensure persistence
        this._startPeriodicBackup();
        
        this.initialized = true;
    }
    
    async _waitForRoomState() {
        // Helper method to ensure room state is fully loaded
        return new Promise(resolve => {
            if (this.game.room.roomState) {
                resolve();
                return;
            }
            
            // Poll until room state exists
            const checkInterval = setInterval(() => {
                if (this.game.room.roomState) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 200);
        });
    }
    
    _startPeriodicBackup() {
        // Save a cache of the leaderboard data every minute
        setInterval(() => {
            if (this.game.room.roomState && this.game.room.roomState.globalLeaderboard) {
                this.leaderboardCache = JSON.parse(JSON.stringify(this.game.room.roomState.globalLeaderboard));
            }
        }, 60000);
    }
    
    async fetchGlobalLeaderboard() {
        await this.initialize();
        
        // If room state is not available, use cache
        if (!this.game.room.roomState || !this.game.room.roomState.globalLeaderboard) {
            if (this.leaderboardCache) {
                return this._formatLeaderboardData(this.leaderboardCache);
            }
            return { bestKills: [], totalKills: [] };
        }
        
        // Save cache of current leaderboard
        this.leaderboardCache = JSON.parse(JSON.stringify(this.game.room.roomState.globalLeaderboard));
        
        // Convert the roomState object format to array format for the UI
        return this._formatLeaderboardData(this.game.room.roomState.globalLeaderboard);
    }
    
    _formatLeaderboardData(leaderboardData) {
        const formattedData = {
            bestKills: [],
            totalKills: []
        };
        
        // Process best kills
        if (leaderboardData.bestKills) {
            const bestKillsObj = leaderboardData.bestKills;
            for (const username in bestKillsObj) {
                formattedData.bestKills.push({
                    username: username,
                    score: bestKillsObj[username]
                });
            }
            // Sort by score descending
            formattedData.bestKills.sort((a, b) => b.score - a.score);
            // Limit to top 10
            formattedData.bestKills = formattedData.bestKills.slice(0, 10);
        }
        
        // Process total kills
        if (leaderboardData.totalKills) {
            const totalKillsObj = leaderboardData.totalKills;
            for (const username in totalKillsObj) {
                formattedData.totalKills.push({
                    username: username,
                    score: totalKillsObj[username]
                });
            }
            // Sort by score descending
            formattedData.totalKills.sort((a, b) => b.score - a.score);
            // Limit to top 10
            formattedData.totalKills = formattedData.totalKills.slice(0, 10);
        }
        
        return formattedData;
    }
    
    async submitScore(username, bestKills, totalKills) {
        if (!username) return false;
        
        await this.initialize();
        
        // If room state is unavailable, store in cache for later sync
        if (!this.game.room.roomState) {
            // Create cache if it doesn't exist
            if (!this.leaderboardCache) {
                this.leaderboardCache = { bestKills: {}, totalKills: {} };
            }
            
            // Update cache with new scores
            const currentBestKills = this.leaderboardCache.bestKills[username] || 0;
            const newBestKills = Math.max(currentBestKills, bestKills);
            
            const currentTotalKills = this.leaderboardCache.totalKills[username] || 0;
            const newTotalKills = Math.max(currentTotalKills, totalKills);
            
            this.leaderboardCache.bestKills[username] = newBestKills;
            this.leaderboardCache.totalKills[username] = newTotalKills;
            
            // Try to update room state when it becomes available
            this._syncCacheToRoomState();
            return true;
        }
        
        // Get current leaderboard data from room state
        const currentLeaderboard = this.game.room.roomState.globalLeaderboard || {
            bestKills: {},
            totalKills: {}
        };
        
        // Update the best kills if higher
        const currentBestKills = currentLeaderboard.bestKills[username] || 0;
        const newBestKills = Math.max(currentBestKills, bestKills);
        
        // Update the total kills if higher
        const currentTotalKills = currentLeaderboard.totalKills[username] || 0;
        const newTotalKills = Math.max(currentTotalKills, totalKills);
        
        // Update the room state
        try {
            await this.game.room.updateRoomState({
                globalLeaderboard: {
                    ...currentLeaderboard,
                    bestKills: {
                        ...currentLeaderboard.bestKills,
                        [username]: newBestKills
                    },
                    totalKills: {
                        ...currentLeaderboard.totalKills,
                        [username]: newTotalKills
                    }
                }
            });
            
            // Update our cache as well
            this.leaderboardCache = JSON.parse(JSON.stringify(this.game.room.roomState.globalLeaderboard));
            
            return true;
        } catch (error) {
            console.error("Failed to update leaderboard:", error);
            
            // Store in cache for later sync if room state update fails
            if (!this.leaderboardCache) {
                this.leaderboardCache = { bestKills: {}, totalKills: {} };
            }
            
            this.leaderboardCache.bestKills[username] = newBestKills;
            this.leaderboardCache.totalKills[username] = newTotalKills;
            
            this._syncCacheToRoomState();
            return false;
        }
    }
    
    _syncCacheToRoomState() {
        // Try to sync cached leaderboard data to room state periodically
        if (!this.syncInterval && this.leaderboardCache) {
            this.syncInterval = setInterval(async () => {
                if (this.game.room.roomState) {
                    try {
                        const currentLeaderboard = this.game.room.roomState.globalLeaderboard || {
                            bestKills: {},
                            totalKills: {}
                        };
                        
                        // Merge cache with current leaderboard
                        const mergedLeaderboard = {
                            bestKills: { ...currentLeaderboard.bestKills },
                            totalKills: { ...currentLeaderboard.totalKills }
                        };
                        
                        // Update with cached values (taking highest scores)
                        for (const username in this.leaderboardCache.bestKills) {
                            const cachedScore = this.leaderboardCache.bestKills[username];
                            const currentScore = mergedLeaderboard.bestKills[username] || 0;
                            mergedLeaderboard.bestKills[username] = Math.max(cachedScore, currentScore);
                        }
                        
                        for (const username in this.leaderboardCache.totalKills) {
                            const cachedScore = this.leaderboardCache.totalKills[username];
                            const currentScore = mergedLeaderboard.totalKills[username] || 0;
                            mergedLeaderboard.totalKills[username] = Math.max(cachedScore, currentScore);
                        }
                        
                        await this.game.room.updateRoomState({
                            globalLeaderboard: mergedLeaderboard
                        });
                        
                        // Update our cache with synchronized data
                        this.leaderboardCache = JSON.parse(JSON.stringify(mergedLeaderboard));
                        
                        // Clear interval once sync is successful
                        clearInterval(this.syncInterval);
                        this.syncInterval = null;
                    } catch (error) {
                        console.error("Failed to sync cached leaderboard data:", error);
                    }
                }
            }, 5000); // Try every 5 seconds
        }
    }
}