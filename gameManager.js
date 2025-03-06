'use strict';

// Constants and configurations
const GAME_CONFIGS = {
    '6aside': {
        totalOvers: 12,
        partnerships: 3,
        maxPlayers: 6,
        minBowlers: 4,
        maxOversPerBowler: 3
    },
    '8aside': {
        totalOvers: 16,
        partnerships: 4,
        maxPlayers: 8,
        minBowlers: 5,
        maxOversPerBowler: 4
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
        console.log('Initializing game with setup data:', setupData); // Debug log

        if (!setupData.format || !GAME_CONFIGS[setupData.format]) {
            throw new Error('Invalid game format');
        }

        const config = GAME_CONFIGS[setupData.format];
        
        this.gameState = {
            format: setupData.format,
            totalOvers: config.totalOvers,
            maxPartnerships: config.partnerships,
            partnerships: Array(config.partnerships).fill().map(() => ({
                runs: 0,
                balls: 0,
                batsman1: null,
                batsman2: null
            })),
            battingTeam: setupData.battingTeam,
            fieldingTeam: setupData.fieldingTeam,
            matchDuration: parseInt(setupData.matchDuration),
            currentInnings: {
                score: 0,
                wickets: 0,
                overs: 0,
                balls: 0,
                extras: {
                    wides: 0,
                    noBalls: 0,
                    penalties: 0
                }
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
                startTime: null
            },
            players: {
                batsmen: setupData.batsmen.map(name => ({
                    name,
                    runs: 0,
                    balls: 0,
                    dismissed: false
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
            isComplete: false
        };

        console.log('Game state initialized:', this.gameState); // Debug log

        this.saveState();
        this.notifyListeners('gameInitialized');
    }

    // Game Action Methods
    addRuns(runs, isExtra = false) {
        if (!this.gameState || !this.validateGameState()) {
            throw new Error('Invalid game state');
        }

        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                score: this.gameState.currentInnings.score + runs
            }
        };

        if (!isExtra) {
            updates.currentBatsmen = {
                ...this.gameState.currentBatsmen,
                strikerRuns: this.gameState.currentBatsmen.strikerRuns + runs
            };

            // Update partnership runs
            const partnershipIndex = this.getCurrentPartnershipIndex();
            updates.partnerships = [...this.gameState.partnerships];
            updates.partnerships[partnershipIndex] = {
                ...updates.partnerships[partnershipIndex],
                runs: (updates.partnerships[partnershipIndex].runs || 0) + runs
            };
        }

        this.updateGameState(updates);
        this.recordBallHistory('runs', runs);
    }

    addExtra(type, runs = 1) {
        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                extras: {
                    ...this.gameState.currentInnings.extras,
                    [type]: this.gameState.currentInnings.extras[type] + runs
                },
                score: this.gameState.currentInnings.score + runs
            }
        };

        this.updateGameState(updates);
        this.recordBallHistory('extra', { type, runs });
    }

    recordWicket(type, fielder = null) {
        if (!DISMISSAL_TYPES.includes(type)) {
            throw new Error('Invalid dismissal type');
        }

        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                wickets: this.gameState.currentInnings.wickets + 1
            },
            currentBowler: {
                ...this.gameState.currentBowler,
                wickets: this.gameState.currentBowler.wickets + 1
            }
        };

        // Mark current striker as dismissed
        const dismissedBatsman = this.gameState.currentBatsmen.striker;
        updates.players = {
            ...this.gameState.players,
            batsmen: this.gameState.players.batsmen.map(b => 
                b.name === dismissedBatsman ? { ...b, dismissed: true } : b
            )
        };

        this.updateGameState(updates);
        this.recordBallHistory('wicket', { type, fielder, batsman: dismissedBatsman });
        this.notifyListeners('wicketFallen');
    }

    recordBall() {
        let overs = this.gameState.currentInnings.overs;
        let balls = this.gameState.currentInnings.balls + 1;

        if (balls === 6) {
            overs++;
            balls = 0;
            this.rotateStrike(); // Auto rotate strike at end of over
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

    setBatsmen(striker, nonStriker) {
        if (!striker || !nonStriker || striker === nonStriker) {
            throw new Error('Invalid batsmen selection');
        }

        const updates = {
            currentBatsmen: {
                striker,
                nonStriker,
                strikerRuns: 0,
                nonStrikerRuns: 0
            }
        };

        // Update current partnership
        const partnershipIndex = this.getCurrentPartnershipIndex();
        updates.partnerships = [...this.gameState.partnerships];
        updates.partnerships[partnershipIndex] = {
            ...updates.partnerships[partnershipIndex],
            batsman1: striker,
            batsman2: nonStriker
        };

        this.updateGameState(updates);
        this.notifyListeners('batsmenSet');
    }

    setBowler(bowlerName) {
        if (!this.validateBowlerAvailable(bowlerName)) {
            throw new Error('Invalid bowler selection');
        }

        const updates = {
            currentBowler: {
                name: bowlerName,
                overs: 0,
                balls: 0,
                runs: 0,
                wickets: 0
            }
        };

        this.updateGameState(updates);
        this.notifyListeners('bowlerSet');
    }

    updateTimer() {
        if (!this.gameState || this.gameState.timer.isPaused) return;

        const now = Date.now();
        const elapsed = Math.floor((now - this.gameState.timer.startTime) / 1000);
        const remaining = Math.max(0, this.gameState.timer.remaining - elapsed);

        const updates = {
            timer: {
                ...this.gameState.timer,
                remaining
            }
        };

        this.updateGameState(updates);

        if (remaining === 0) {
            this.endInnings();
        }
    }

    toggleTimer() {
        const isPaused = !this.gameState.timer.isPaused;
        const updates = {
            timer: {
                ...this.gameState.timer,
                isPaused,
                startTime: isPaused ? null : Date.now()
            }
        };

        this.updateGameState(updates);
        this.notifyListeners('timerToggled');
    }

    endInnings() {
        const updates = {
            isComplete: true,
            timer: {
                ...this.gameState.timer,
                isPaused: true
            }
        };

        this.updateGameState(updates);
        this.notifyListeners('inningsComplete');
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

        // Add validation rules here
        const isValid = (
            this.gameState.currentInnings.overs <= config.totalOvers &&
            this.gameState.partnerships.length === config.partnerships &&
            this.gameState.currentInnings.balls < 6
        );

        if (!isValid) {
            console.error('Invalid game state detected');
            return false;
        }

        return true;
    }

    saveState() {
        localStorage.setItem('indoorCricketGame', JSON.stringify(this.gameState));
    }

    // Helper Methods
    getCurrentPartnershipIndex() {
        return Math.floor(this.gameState.currentInnings.wickets / 2);
    }

    getFormattedTimer() {
        const minutes = Math.floor(this.gameState.timer.remaining / 60);
        const seconds = this.gameState.timer.remaining % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    recordBallHistory(type, details) {
        const ballRecord = {
            type,
            details,
            over: this.gameState.currentInnings.overs,
            ball: this.gameState.currentInnings.balls,
            bowler: this.gameState.currentBowler.name,
            timestamp: Date.now()
        };

        this.gameState.ballHistory.push(ballRecord);
        this.saveState();
    }

    // Validation Methods
    validateBatsmanAvailable(name) {
        return this.gameState.players.batsmen.some(b => b.name === name && !b.dismissed);
    }

    validateBowlerAvailable(name) {
        const bowler = this.gameState.players.bowlers.find(b => b.name === name);
        if (!bowler) return false;

        const config = GAME_CONFIGS[this.gameState.format];
        const oversCount = bowler.balls / 6;
        return oversCount < config.maxOversPerBowler;
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
