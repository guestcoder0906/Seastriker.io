import { CONFIG } from '../core/config.js';
import { GlobalLeaderboardService } from './globalLeaderboardService.js';

export class GlobalLeaderboardManager {
    constructor(game) {
        this.game = game;
        this.leaderboardData = {
            totalKills: [],
            bestKills: []
        };
        this.leaderboardService = new GlobalLeaderboardService(game);
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Make sure leaderboard service is initialized
            await this.leaderboardService.initialize();
            // Immediately fetch leaderboard data to ensure it's loaded
            this.leaderboardData = await this.leaderboardService.fetchGlobalLeaderboard();
            this.initialized = true;
        } catch (error) {
            console.error("Failed to initialize global leaderboard manager:", error);
        }
    }

    async fetchGlobalLeaderboard() {
        try {
            await this.initialize();
            
            // Prepare a leaderboardData object from roomState
            const leaderboardData = {
                bestKills: [],
                totalKills: []
            };
            
            if (this.game.room.roomState.globalLeaderboard) {
                // Process best kills
                if (this.game.room.roomState.globalLeaderboard.bestKills) {
                    const bestKillsObj = this.game.room.roomState.globalLeaderboard.bestKills;
                    for (const username in bestKillsObj) {
                        leaderboardData.bestKills.push({
                            username: username,
                            score: bestKillsObj[username]
                        });
                    }
                    leaderboardData.bestKills.sort((a, b) => b.score - a.score);
                    // Removed slice to include all users
                }
                
                // Process total kills
                if (this.game.room.roomState.globalLeaderboard.totalKills) {
                    const totalKillsObj = this.game.room.roomState.globalLeaderboard.totalKills;
                    for (const username in totalKillsObj) {
                        leaderboardData.totalKills.push({
                            username: username,
                            score: totalKillsObj[username]
                        });
                    }
                    leaderboardData.totalKills.sort((a, b) => b.score - a.score);
                    // Removed slice to include all users
                }
            }
            
            // Store for local reference
            this.leaderboardData = leaderboardData;
            return leaderboardData;
        } catch (error) {
            console.error("Error fetching global leaderboard:", error);
            return this.leaderboardData;
        }
    }

    async submitScore(username, bestKills, totalKills) {
        try {
            // Submit to the service
            const success = await this.leaderboardService.submitScore(username, bestKills, totalKills);
            
            // Refresh our local copy of the leaderboard
            if (success) {
                await this.fetchGlobalLeaderboard();
            }
            
            return success;
        } catch (e) {
            console.error('Error submitting global score:', e);
            return false;
        }
    }
}