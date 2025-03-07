// Game format configurations
const GAME_FORMATS = {
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
    'Penalty'
];

class GameManager {
    constructor() {
        // Initialize game state from localStorage if available
        const savedState = localStorage.getItem('gameState');
        if (savedState) {
            this.gameState = JSON.parse(savedState);
        }

        // Set up broadcast channel for real-time communication
        this.channel = new BroadcastChannel('cricketGame');

        // Initialize listeners array
        this.listeners = [];

        // Start timer update interval
        this.timerInterval = setInterval(() => {
            if (this.gameState && !this.gameState.timer.isPaused) {
                this.updateTimer();
            }
        }, 1000);
    }

    initializeGame(setupData) {
        const format = setupData.format;
        const config = GAME_FORMATS[format];

        this.gameState = {
            format: format,
            teams: {
                team1: setupData.team1Name,
                team2: setupData.team2Name
            },
            players: {
                batsmen: setupData.team1Players.map(name => ({ name, dismissed: false, runs: 0 })),
                bowlers: setupData.team2Players.map(name => ({ name, overs: 0, balls: 0 }))
            },
            currentInnings: {
                score: 0,
                wickets: 0,
                overs: 0,
                balls: 0
            },
            firstInnings: null,
            isFirstInnings: true,
            currentBatsmen: {
                striker: null,
                nonStriker: null,
                strikerRuns: 0,
                nonStrikerRuns: 0
            },
            currentBowler: {
                name: null,
                overs: 0,
                balls: 0
            },
            partnerships: Array(config.partnerships).fill().map(() => ({
                runs: 0,
                balls: 0
            })),
            timer: {
                duration: setupData.matchDuration * 60, // Convert to seconds
                remaining: setupData.matchDuration * 60,
                isPaused: true
            },
            ballHistory: [],
            config: config
        };

        this.saveState();
        this.notifyListeners('initialized');
    }
        addRuns(runs, isCustom = false) {
        if (!this.gameState) return;

        let finalRuns = runs;
        if (isCustom) {
            const customRuns = parseInt(prompt('Enter number of runs:', '0'));
            if (isNaN(customRuns) || customRuns < 0) return;
            finalRuns = customRuns;
        }

        // Update current innings
        this.gameState.currentInnings.score += finalRuns;

        // Update current batsman's runs
        this.gameState.currentBatsmen.strikerRuns += finalRuns;

        // Update current partnership
        const currentPartnership = this.gameState.partnerships[this.getCurrentPartnershipIndex()];
        currentPartnership.runs += finalRuns;

        // Add to ball history
        this.gameState.ballHistory.push({
            type: 'runs',
            details: finalRuns,
            over: this.gameState.currentInnings.overs,
            ball: this.gameState.currentInnings.balls
        });

        // Rotate strike for odd runs
        if (finalRuns % 2 === 1) {
            this.rotateStrike();
        }

        this.notifyListeners('runsAdded');
    }

    recordWicket(type) {
        if (!this.gameState || !DISMISSAL_TYPES.includes(type)) return;

        // Update current innings
        this.gameState.currentInnings.score -= 5; // -5 runs for a wicket
        this.gameState.currentInnings.wickets++;

        // Update current partnership
        const currentPartnership = this.gameState.partnerships[this.getCurrentPartnershipIndex()];
        currentPartnership.runs -= 5;

        // Add to ball history
        this.gameState.ballHistory.push({
            type: 'wicket',
            details: { type },
            over: this.gameState.currentInnings.overs,
            ball: this.gameState.currentInnings.balls
        });

        this.notifyListeners('wicketTaken');
    }

    recordBall() {
        if (!this.gameState) return;

        // Update balls and overs
        this.gameState.currentInnings.balls++;
        if (this.gameState.currentInnings.balls === 6) {
            this.gameState.currentInnings.overs++;
            this.gameState.currentInnings.balls = 0;
            this.rotateStrike(); // Rotate strike at end of over
        }

        // Update current partnership balls
        const currentPartnership = this.gameState.partnerships[this.getCurrentPartnershipIndex()];
        currentPartnership.balls++;

        // Check for partnership change
        this.checkPartnershipChange();

        // Check for innings completion
        if (this.gameState.currentInnings.overs >= this.gameState.config.totalOvers) {
            this.endInnings();
        }

        this.notifyListeners('ballRecorded');
    }

    rotateStrike() {
        if (!this.gameState) return;

        // Swap striker and non-striker
        const temp = {
            name: this.gameState.currentBatsmen.striker,
            runs: this.gameState.currentBatsmen.strikerRuns
        };
        this.gameState.currentBatsmen.striker = this.gameState.currentBatsmen.nonStriker;
        this.gameState.currentBatsmen.strikerRuns = this.gameState.currentBatsmen.nonStrikerRuns;
        this.gameState.currentBatsmen.nonStriker = temp.name;
        this.gameState.currentBatsmen.nonStrikerRuns = temp.runs;

        this.notifyListeners('strikeRotated');
    }

    checkPartnershipChange() {
        const currentPartnership = this.gameState.partnerships[this.getCurrentPartnershipIndex()];
        const oversPerPartnership = this.gameState.config.oversPerPartnership;
        
        if (currentPartnership.balls >= oversPerPartnership * 6) {
            this.notifyListeners('partnershipComplete');
        }
    }

    updateTimer() {
        if (!this.gameState || this.gameState.timer.isPaused) return;

        this.gameState.timer.remaining--;
        if (this.gameState.timer.remaining <= 0) {
            this.gameState.timer.remaining = 0;
            this.endInnings();
        }

        this.notifyListeners('timerUpdated');
    }

    toggleTimer() {
        if (!this.gameState) return;
        this.gameState.timer.isPaused = !this.gameState.timer.isPaused;
        this.notifyListeners('timerToggled');
    }

    setBatsmen(striker, nonStriker) {
        if (!this.gameState) return;
        this.gameState.currentBatsmen.striker = striker;
        this.gameState.currentBatsmen.nonStriker = nonStriker;
        this.gameState.currentBatsmen.strikerRuns = 0;
        this.gameState.currentBatsmen.nonStrikerRuns = 0;
        this.notifyListeners('batsmenSet');
    }

    setBowler(bowlerName) {
        if (!this.gameState) return;
        this.gameState.currentBowler.name = bowlerName;
        this.notifyListeners('bowlerSet');
    }

    endInnings() {
        if (!this.gameState) return;

        if (this.gameState.isFirstInnings) {
            // Save first innings data
            this.gameState.firstInnings = { ...this.gameState.currentInnings };
            
            // Switch teams
            const tempBatsmen = this.gameState.players.batsmen;
            this.gameState.players.batsmen = this.gameState.players.bowlers.map(b => ({ name: b.name, dismissed: false, runs: 0 }));
            this.gameState.players.bowlers = tempBatsmen.map(b => ({ name: b.name, overs: 0, balls: 0 }));

            // Reset current innings
            this.gameState.currentInnings = { score: 0, wickets: 0, overs: 0, balls: 0 };
            this.gameState.isFirstInnings = false;
            this.gameState.partnerships = Array(this.gameState.config.partnerships).fill().map(() => ({ runs: 0, balls: 0 }));
            this.gameState.currentBatsmen = { striker: null, nonStriker: null, strikerRuns: 0, nonStrikerRuns: 0 };
            this.gameState.currentBowler = { name: null, overs: 0, balls: 0 };
            this.gameState.ballHistory = [];

            this.notifyListeners('firstInningsComplete');
        } else {
            this.notifyListeners('matchComplete');
        }
    }

    updateGameState(updates) {
        if (!this.gameState) return;
        Object.assign(this.gameState, updates);
        this.validateGameState();
        this.notifyListeners('stateUpdated');
    }

    validateGameState() {
        if (!this.gameState || !this.gameState.config) return;
        // Add validation logic as needed
    }

    saveState() {
        if (this.gameState) {
            localStorage.setItem('gameState', JSON.stringify(this.gameState));
        }
    }

    getCurrentPartnershipIndex() {
        return Math.min(
            Math.floor((this.gameState.currentInnings.overs * 6 + this.gameState.currentInnings.balls) / 
                (this.gameState.config.oversPerPartnership * 6)),
            this.gameState.config.partnerships - 1
        );
    }

    getFormattedTimer() {
        const minutes = Math.floor(this.gameState.timer.remaining / 60);
        const seconds = this.gameState.timer.remaining % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(event) {
        // Save state to localStorage
        this.saveState();
        
        // Broadcast the update
        this.channel.postMessage({
            state: this.gameState,
