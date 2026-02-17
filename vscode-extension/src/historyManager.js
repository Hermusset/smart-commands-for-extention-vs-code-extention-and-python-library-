const vscode = require('vscode');

const MAX_HISTORY = 100;
const HISTORY_KEY = 'aiTerminal.history';

class HistoryManager {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
    }

    /**
     * Get all history entries
     * @returns {Array<{input: string, command: string, explanation: string, provider: string, timestamp: string}>}
     */
    getHistory() {
        return this.context.globalState.get(HISTORY_KEY, []);
    }

    /**
     * Add a new entry to history
     */
    addEntry(entry) {
        const history = this.getHistory();
        history.unshift(entry);
        if (history.length > MAX_HISTORY) {
            history.length = MAX_HISTORY;
        }
        this.context.globalState.update(HISTORY_KEY, history);
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this.context.globalState.update(HISTORY_KEY, []);
    }

    /**
     * Get recent entries
     */
    getRecent(count = 10) {
        return this.getHistory().slice(0, count);
    }
}

module.exports = { HistoryManager };
