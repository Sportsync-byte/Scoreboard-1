'use strict';

// Constants and configurations
const GAME_CONFIGS = {
    '6aside': {
        totalOvers: 12,
        partnerships: 3,
        oversPerPartnership: 4,
        maxPlayers: 6,
        minBowlers: 6,
        maxOversPerBowler: 2
    },
    '8aside': {
        totalOvers: 16,
        partnerships: 4,
        oversPerPartnership: 4,
        maxPlayers: 8,
        minBowlers: 8,
        maxOversPerBowler: 2
    }
};

const DISMISSAL_TYPES = [
    'Bowled',
    'Caught',
    'Run Out',
    'Stumped',
    'Hit Wicket',
    'Handled Ball',
    'Obstructing',
    'Timed Out'
];

class GameManager {
    constructor() {
        this.gameState = null;
        this.listeners = new Set();
        this.firstInningsPartnerships = null;
        
        // Bind methods
        this.initializeGame = this.initializeGame.bind(this);
        this.updateGameState = this.updateGameState.bind(this);
        this.validateGameState = this.validateGameState.bind(this);
        
        // Initialize from localStorage if exists
        const savedState = localStorage.getItem('indoorCricketGame');
        if (savedState) {
            this.gameState = JSON.parse(savedState);
        }

        // Start timer update interval
        setInterval(() => {
            if (this.gameState && !this.gameState.timer.isPaused) {
                this.updateTimer();
            }
        }, 1000);
    }

    // Initialize new game from setup
    initializeGame(setupData) {
        console.log('Initializing game with setup data:', setupData);

        if (!setupData.format || !GAME_CONFIGS[setupData.format]) {
            throw new Error('Invalid game format');
        }

        const config = GAME_CONFIGS[setupData.format];
        
        this.gameState = {
            format: setupData.format,
            totalOvers: config.totalOvers,
            maxPartnerships: config.partnerships,
            oversPerPartnership: config.oversPerPartnership,
            partnerships: Array(config.partnerships).fill().map(() => ({
                runs: 0,
                balls: 0,
                batsman1: null,
                batsman2: null,
                overs: 0
            })),
            battingTeam: setupData.battingTeam,
            fieldingTeam: setupData.fieldingTeam,
            matchDuration: parseInt(setupData.matchDuration),
            currentInnings: {
                score: 0,
                wickets: 0,
                overs: 0,
                balls: 0
            },
            currentBatsmen: {
                striker: null,
                nonStriker: null,
                strikerRuns: 0,
                nonStrikerRuns: 0
            },
            currentBowler: {
                name: null,
                overs: 0,
                balls: 0,
                runs: 0,
                wickets: 0
            },
            timer: {
                remaining: parseInt(setupData.matchDuration) * 60,
                isPaused: true,
                startTime: null,
                lastUpdate: null
            },
            players: {
                batsmen: setupData.batsmen.map(name => ({
                    name,
                    runs: 0,
                    balls: 0
                })),
                bowlers: setupData.bowlers.map(name => ({
                    name,
                    overs: 0,
                    balls: 0,
                    runs: 0,
                    wickets: 0
                }))
            },
            ballHistory: [],
            isFirstInnings: true,
            isComplete: false,
            inningsHistory: []
        };

        console.log('Game state initialized:', this.gameState);

        this.saveState();
        this.notifyListeners('gameInitialized');
    }
        // Game Action Methods
    addRuns(runs, isCustom = false) {
        if (!this.gameState || !this.validateGameState()) {
            throw new Error('Invalid game state');
        }

        // Handle custom runs input
        let actualRuns = runs;
        if (isCustom) {
            const customRuns = parseInt(prompt("Enter runs (8 or more):", "8"));
            if (isNaN(customRuns) || customRuns < 8) return;
            actualRuns = customRuns;
        }

        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                score: this.gameState.currentInnings.score + actualRuns
            },
            currentBatsmen: {
                ...this.gameState.currentBatsmen,
                strikerRuns: this.gameState.currentBatsmen.strikerRuns + actualRuns
            }
        };

        // Update partnership runs
        const partnershipIndex = this.getCurrentPartnershipIndex();
        updates.partnerships = [...this.gameState.partnerships];
        updates.partnerships[partnershipIndex] = {
            ...updates.partnerships[partnershipIndex],
            runs: (updates.partnerships[partnershipIndex].runs || 0) + actualRuns
        };

        this.updateGameState(updates);
        this.recordBallHistory('runs', actualRuns);

        // Always rotate strike in indoor cricket
        this.rotateStrike();
    }

    recordWicket(type) {
        const WICKET_PENALTY = -5;
        
        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                score: this.gameState.currentInnings.score + WICKET_PENALTY,
                wickets: this.gameState.currentInnings.wickets + 1
            },
            currentBatsmen: {
                ...this.gameState.currentBatsmen,
                strikerRuns: this.gameState.currentBatsmen.strikerRuns + WICKET_PENALTY
            }
        };

        // Update partnership runs
        const partnershipIndex = this.getCurrentPartnershipIndex();
        updates.partnerships = [...this.gameState.partnerships];
        updates.partnerships[partnershipIndex] = {
            ...updates.partnerships[partnershipIndex],
            runs: (updates.partnerships[partnershipIndex].runs || 0) + WICKET_PENALTY
        };

        this.updateGameState(updates);
        this.recordBallHistory('wicket', { type, penalty: WICKET_PENALTY });
    }

    recordBall() {
        let overs = this.gameState.currentInnings.overs;
        let balls = this.gameState.currentInnings.balls + 1;

        if (balls === 6) {
            overs++;
            balls = 0;
        }

        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                overs,
                balls
            },
            currentBowler: {
                ...this.gameState.currentBowler,
                balls: this.gameState.currentBowler.balls + 1
            }
        };

        this.updateGameState(updates);
        
        // Check for partnership change
        if (overs > 0 && overs % this.gameState.oversPerPartnership === 0 && balls === 0) {
            this.checkPartnershipChange();
        }

        // Check if innings is complete
        if (overs >= this.gameState.totalOvers) {
            this.endInnings();
        }
    }

    rotateStrike() {
        const updates = {
            currentBatsmen: {
                ...this.gameState.currentBatsmen,
                striker: this.gameState.currentBatsmen.nonStriker,
                nonStriker: this.gameState.currentBatsmen.striker,
                strikerRuns: this.gameState.currentBatsmen.nonStrikerRuns,
                nonStrikerRuns: this.gameState.currentBatsmen.strikerRuns
            }
        };

        this.updateGameState(updates);
    }

    checkPartnershipChange() {
        const currentPartnership = Math.floor(this.gameState.currentInnings.overs / this.gameState.oversPerPartnership);
        this.notifyListeners('partnershipComplete');
    }

    updateTimer() {
        if (!this.gameState || this.gameState.timer.isPaused) return;

        const now = Date.now();
        if (!this.gameState.timer.lastUpdate) {
            this.gameState.timer.lastUpdate = now;
            return;
        }

        const elapsed = Math.floor((now - this.gameState.timer.lastUpdate) / 1000);
        if (elapsed >= 1) {
            const updates = {
                timer: {
                    ...this.gameState.timer,
                    remaining: Math.max(0, this.gameState.timer.remaining - 1),
                    lastUpdate: now
                }
            };

            this.updateGameState(updates);

            if (updates.timer.remaining === 0) {
                this.endInnings();
            }
        }
    }

    toggleTimer() {
        const isPaused = !this.gameState.timer.isPaused;
        const updates = {
            timer: {
                ...this.gameState.timer,
                isPaused,
                startTime: isPaused ? null : Date.now(),
                lastUpdate: isPaused ? null : Date.now()
            }
        };

        this.updateGameState(updates);
        this.notifyListeners('timerToggled');
    }

    endInnings() {
        if (this.gameState.isFirstInnings) {
            // Save first innings partnerships
            this.firstInningsPartnerships = [...this.gameState.partnerships];
            
            // Start second innings
            const updates = {
                isFirstInnings: false,
                currentInnings: {
                    score: 0,
                    wickets: 0,
                    overs: 0,
                    balls: 0
                },
                partnerships: Array(this.gameState.maxPartnerships).fill().map(() => ({
                    runs: 0,
                    balls: 0,
                    batsman1: null,
                    batsman2: null,
                    overs: 0
                })),
                timer: {
                    remaining: parseInt(this.gameState.matchDuration) * 60,
                    isPaused: true,
                    startTime: null,
                    lastUpdate: null
                }
            };
            
            this.updateGameState(updates);
            this.notifyListeners('firstInningsComplete');
        } else {
            // End of match
            const updates = {
                isComplete: true,
                timer: {
                    ...this.gameState.timer,
                    isPaused: true
                }
            };
            
            this.updateGameState(updates);
            this.notifyListeners('matchComplete');
        }
    }

    // State Management Methods
    updateGameState(updates) {
        this.gameState = {
            ...this.gameState,
            ...updates
        };
        
        if (this.validateGameState()) {
            this.saveState();
            this.notifyListeners('stateUpdated');
        }
    }

    validateGameState() {
        if (!this.gameState) return false;
        
        const config = GAME_CONFIGS[this.gameState.format];
        if (!config) return false;

        return true;
    }

    saveState() {
        localStorage.setItem('indoorCricketGame', JSON.stringify(this.gameState));
    }

    // Helper Methods
    getCurrentPartnershipIndex() {
        return Math.floor(this.gameState.currentInnings.overs / this.gameState.oversPerPartnership);
    }

    getFormattedTimer() {
        const minutes = Math.floor(this.gameState.timer.remaining / 60);
        const seconds = this.gameState.timer.remaining % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    getFirstInningsPartnerships() {
        return this.firstInningsPartnerships;
    }

    // Subscription Methods
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event) {
        this.listeners.forEach(callback => callback(this.gameState, event));
    }
}

// Create singleton instance
const gameManager = new GameManager();

// Make available globally
window.gameManager = gameManager;

// Export for module usage
export default gameManager;
