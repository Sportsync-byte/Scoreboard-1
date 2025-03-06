class GameManager {
    // ... previous constructor and initialization code ...

    // Game Action Methods
    addRuns(runs) {
        if (!this.gameState || !this.validateGameState()) {
            throw new Error('Invalid game state');
        }

        const updates = {
            currentInnings: {
                ...this.gameState.currentInnings,
                score: this.gameState.currentInnings.score + runs
            },
            currentBatsmen: {
                ...this.gameState.currentBatsmen,
                strikerRuns: this.gameState.currentBatsmen.strikerRuns + runs
            },
            currentPartnership: {
                ...this.gameState.partnerships[this.getCurrentPartnershipIndex()],
                runs: (this.gameState.partnerships[this.getCurrentPartnershipIndex()].runs || 0) + runs
            }
        };

        this.updateGameState(updates);
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
                overs: Math.floor(this.gameState.currentBowler.balls / 6),
                balls: this.gameState.currentBowler.balls % 6
            }
        };

        this.updateGameState(updates);
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

        this.updateGameState(updates);
        this.notifyListeners('batsmenSet');
    }

    setBowler(bowlerName) {
        if (!bowlerName) {
            throw new Error('Invalid bowler selection');
        }

        const updates = {
            currentBowler: {
                name: bowlerName,
                overs: 0,
                runs: 0,
                wickets: 0
            }
        };

        this.updateGameState(updates);
        this.notifyListeners('bowlerSet');
    }

    updateTimer() {
        if (this.gameState.timer.isPaused) return;

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

    // Helper Methods
    getCurrentPartnershipIndex() {
        return Math.floor(this.gameState.currentInnings.wickets / 2);
    }

    getFormattedTimer() {
        const minutes = Math.floor(this.gameState.timer.remaining / 60);
        const seconds = this.gameState.timer.remaining % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Additional validation methods
    validateBatsmanAvailable(name) {
        return this.gameState.players.batsmen.some(b => b.name === name && !b.dismissed);
    }

    validateBowlerAvailable(name) {
        return this.gameState.players.bowlers.some(b => b.name === name);
    }
}
