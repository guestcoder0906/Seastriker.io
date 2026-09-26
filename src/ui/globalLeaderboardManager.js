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
            await this.leaderboardService.initialize();
            this.leaderboardData = await this.leaderboardService.fetchGlobalLeaderboard();
            this.initialized = true;
        } catch (error) {
            console.error("Failed to initialize global leaderboard manager:", error);
        }
    }

    async fetchGlobalLeaderboard() {
        try {
            await this.initialize();
            const data = await this.leaderboardService.fetchGlobalLeaderboard();
            if (data) {
                this.leaderboardData = data;
            }
            return this.leaderboardData;
        } catch (error) {
            console.error("Error fetching global leaderboard:", error);
            return this.leaderboardData;
        }
    }

    async submitScore(username, bestKills, totalKills) {
        try {
            const success = await this.leaderboardService.submitScore(username, bestKills, totalKills);
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
