const vscode = require('vscode');
const { spawn } = require('child_process');

/**
 * Custom pseudo-terminal that acts as a smart AI-powered shell.
 *
 * User types plain English → extension translates → executes the real command.
 * If the input already looks like a valid command, it's executed directly.
 */
class AITerminalPty {
    /**
     * @param {import('./aiService').AIService} aiService
     * @param {import('./historyManager').HistoryManager} historyManager
     */
    constructor(aiService, historyManager) {
        this.aiService = aiService;
        this.historyManager = historyManager;

        // VS Code pseudo-terminal events
        this.writeEmitter = new vscode.EventEmitter();
        this.onDidWrite = this.writeEmitter.event;
        this.closeEmitter = new vscode.EventEmitter();
        this.onDidClose = this.closeEmitter.event;

        this.line = '';
        this.cursorPos = 0;
        this.cmdHistory = [];
        this.historyIdx = -1;
        this.busy = false;
        this.childProc = null;
        this.cols = 80;
    }

    // ───── Lifecycle ─────

    open(initialDimensions) {
        if (initialDimensions) this.cols = initialDimensions.columns;
        this._banner();
        this._prompt();
    }

    close() {
        this._killChild();
    }

    setDimensions(dim) {
        this.cols = dim.columns;
    }

    // ───── Input handling ─────

    handleInput(data) {
        // While a child process runs, pipe input to it
        if (this.childProc) {
            if (data === '\x03') {
                this._killChild();
                return;
            }
            this.childProc.stdin.write(data);
            return;
        }

        if (this.busy) {
            if (data === '\x03') {
                this.busy = false;
                this._write('\r\n\x1b[33m^C cancelled\x1b[0m\r\n');
                this._prompt();
            }
            return;
        }

        for (let i = 0; i < data.length; i++) {
            const ch = data[i];

            if (ch === '\r') {
                // ── Enter ──
                this._write('\r\n');
                const input = this.line.trim();
                if (input) {
                    this.cmdHistory.unshift(input);
                    if (this.cmdHistory.length > 200) this.cmdHistory.pop();
                }
                this.historyIdx = -1;
                this.line = '';
                this.cursorPos = 0;

                if (input) {
                    this._processInput(input);
                } else {
                    this._prompt();
                }
            } else if (ch === '\x7f' || ch === '\b') {
                // ── Backspace ──
                if (this.cursorPos > 0) {
                    this.line = this.line.slice(0, this.cursorPos - 1) + this.line.slice(this.cursorPos);
                    this.cursorPos--;
                    this._refreshLine();
                }
            } else if (ch === '\x03') {
                // ── Ctrl+C ──
                this._write('^C\r\n');
                this.line = '';
                this.cursorPos = 0;
                this._prompt();
            } else if (ch === '\x1b') {
                // ── Escape sequences ──
                const remaining = data.substring(i);
                if (remaining.startsWith('\x1b[A')) {
                    this._historyUp();
                    i += 2;
                } else if (remaining.startsWith('\x1b[B')) {
                    this._historyDown();
                    i += 2;
                } else if (remaining.startsWith('\x1b[C')) {
                    // Right arrow
                    if (this.cursorPos < this.line.length) {
                        this.cursorPos++;
                        this._write('\x1b[C');
                    }
                    i += 2;
                } else if (remaining.startsWith('\x1b[D')) {
                    // Left arrow
                    if (this.cursorPos > 0) {
                        this.cursorPos--;
                        this._write('\x1b[D');
                    }
                    i += 2;
                } else {
                    i += 2; // Skip unknown escape seq
                }
            } else if (ch >= ' ') {
                // ── Printable character ──
                this.line = this.line.slice(0, this.cursorPos) + ch + this.line.slice(this.cursorPos);
                this.cursorPos++;
                this._refreshLine();
            }
        }
    }

    // ───── Input Processing ─────

    async _processInput(input) {
        const lower = input.toLowerCase().trim();

        // Built-in commands
        if (lower === 'exit' || lower === 'quit') {
            this._write('\x1b[90mGoodbye!\x1b[0m\r\n');
            this.closeEmitter.fire(0);
            return;
        }
        if (lower === 'help') {
            this._showHelp();
            return;
        }
        if (lower === 'clear' || lower === 'cls') {
            this._write('\x1b[2J\x1b[3J\x1b[H');
            this._prompt();
            return;
        }
        if (lower === 'history') {
            this._showHistory();
            return;
        }

        // Determine: natural language or direct command?
        if (this._isNaturalLanguage(input)) {
            await this._translateAndExecute(input);
        } else {
            await this._executeCommand(input);
        }
    }

    /**
     * Heuristic to detect natural language vs shell commands.
     */
    _isNaturalLanguage(input) {
        const trimmed = input.trim();

        // Known command prefixes → direct command
        const cmdPrefixes = /^(git|docker|docker-compose|npm|npx|yarn|pnpm|pip|pip3|python|python3|node|cargo|go|rustc|kubectl|helm|terraform|ansible|ansible-playbook|aws|az|gcloud|curl|wget|ssh|scp|rsync|ping|tracert|traceroute|nslookup|ls|ll|la|dir|cd|pwd|mkdir|rmdir|rm|del|cp|copy|mv|move|cat|type|more|less|head|tail|echo|printf|grep|findstr|find|sed|awk|sort|wc|chmod|chown|chgrp|kill|pkill|ps|top|htop|df|du|tar|zip|unzip|gzip|gunzip|make|cmake|gcc|g\+\+|clang|javac|java|mvn|gradle|dotnet|mongosh|mongo|mysql|psql|sqlite3|redis-cli|streamlit|flask|uvicorn|gunicorn|nginx|systemctl|service|apt|apt-get|brew|choco|winget|snap|yum|dnf|pacman|code|vim|nano|emacs|nvim|powershell|pwsh|cmd|bash|zsh|sh|sudo|su|whoami|hostname|uname|env|set|export|source|which|where|man|info|ping|netstat|ifconfig|ipconfig|nmap|nc|openssl|certbot)\b/i;

        if (cmdPrefixes.test(trimmed)) return false;
        if (/^[.\/~\\]/.test(trimmed)) return false; // Starts with path
        if (/\.(exe|sh|bat|cmd|ps1|py|js|ts)\s/i.test(trimmed)) return false;
        if (/^[A-Z]:\\/.test(trimmed)) return false; // Windows path

        // 2+ words without flags → likely natural language
        const words = trimmed.split(/\s+/);
        if (words.length >= 2 && !trimmed.includes('--') && !trimmed.includes(' -')) {
            return true;
        }

        // Single word that's not a known command → probably NL
        if (words.length === 1 && !cmdPrefixes.test(trimmed)) {
            // Could be a typo or short NL. Treat as NL if it's a common English word
            const commonWords = ['create', 'make', 'build', 'run', 'start', 'stop', 'install', 'remove',
                'delete', 'show', 'list', 'find', 'search', 'update', 'upgrade', 'deploy', 'push',
                'pull', 'commit', 'merge', 'rebase', 'checkout', 'switch', 'connect', 'compile',
                'download', 'upload', 'open', 'close', 'restart', 'clean', 'test', 'init', 'setup'];
            return commonWords.includes(trimmed.toLowerCase());
        }

        return words.length >= 3;
    }

    // ───── Translate + Execute ─────

    async _translateAndExecute(input) {
        this.busy = true;
        this._write('\x1b[90m   Translating...\x1b[0m\r\n');

        try {
            const result = await this.aiService.translateToCommand(input);

            if (!result || !result.command) {
                this._write('\x1b[31m   Could not translate. Try rephrasing.\x1b[0m\r\n\r\n');
                this.busy = false;
                this._prompt();
                return;
            }

            // Show the translated command
            this._write(`\r\n\x1b[1;32m   \u2713\x1b[0m \x1b[1;97m${result.command}\x1b[0m\r\n`);
            this._write(`\x1b[90m     ${result.explanation}\x1b[0m\r\n`);
            if (result.warning) {
                this._write(`\x1b[1;33m     ! ${result.warning}\x1b[0m\r\n`);
            }
            this._write('\r\n');

            // Save to history
            const provider = this.aiService.getProvider();
            this.historyManager.addEntry({
                input,
                command: result.command,
                explanation: result.explanation,
                provider,
                timestamp: new Date().toLocaleString(),
            });

            // Execute the translated command
            this.busy = false;
            await this._executeCommand(result.command);

        } catch (err) {
            this._write(`\x1b[1;31m   Error: ${err.message}\x1b[0m\r\n\r\n`);
            this.busy = false;
            this._prompt();
        }
    }

    // ───── Command Execution ─────

    async _executeCommand(command) {
        const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
        const args = process.platform === 'win32'
            ? ['-NoProfile', '-NoLogo', '-Command', command]
            : ['-c', command];

        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd();

        return new Promise((resolve) => {
            try {
                this.childProc = spawn(shell, args, {
                    cwd,
                    env: { ...process.env },
                });

                this.childProc.stdout.on('data', (data) => {
                    this._write(data.toString().replace(/\n/g, '\r\n'));
                });

                this.childProc.stderr.on('data', (data) => {
                    this._write(data.toString().replace(/\n/g, '\r\n'));
                });

                this.childProc.on('close', (code) => {
                    this.childProc = null;
                    if (code && code !== 0) {
                        this._write(`\x1b[90m(exit ${code})\x1b[0m\r\n`);
                    }
                    this._write('\r\n');
                    this._prompt();
                    resolve();
                });

                this.childProc.on('error', (err) => {
                    this.childProc = null;
                    this._write(`\x1b[31mExecution error: ${err.message}\x1b[0m\r\n\r\n`);
                    this._prompt();
                    resolve();
                });
            } catch (err) {
                this.childProc = null;
                this._write(`\x1b[31mFailed to start: ${err.message}\x1b[0m\r\n\r\n`);
                this._prompt();
                resolve();
            }
        });
    }

    // ───── Display helpers ─────

    _write(text) {
        this.writeEmitter.fire(text);
    }

    _prompt() {
        this.busy = false;
        const provider = this.aiService.getProvider();
        const tag = provider.charAt(0).toUpperCase() + provider.slice(1);
        this._write(`\x1b[1;35m[${tag}]\x1b[0m \x1b[1;36m>\x1b[0m `);
    }

    _refreshLine() {
        // Redraw from prompt
        const provider = this.aiService.getProvider();
        const tag = provider.charAt(0).toUpperCase() + provider.slice(1);
        const promptLen = tag.length + 4; // [Tag] >_

        this._write(`\r\x1b[1;35m[${tag}]\x1b[0m \x1b[1;36m>\x1b[0m ${this.line}\x1b[K`);
        // Position cursor
        const backMoves = this.line.length - this.cursorPos;
        if (backMoves > 0) {
            this._write(`\x1b[${backMoves}D`);
        }
    }

    _historyUp() {
        if (this.historyIdx < this.cmdHistory.length - 1) {
            this.historyIdx++;
            this._setLine(this.cmdHistory[this.historyIdx]);
        }
    }

    _historyDown() {
        if (this.historyIdx > 0) {
            this.historyIdx--;
            this._setLine(this.cmdHistory[this.historyIdx]);
        } else if (this.historyIdx === 0) {
            this.historyIdx = -1;
            this._setLine('');
        }
    }

    _setLine(text) {
        this.line = text;
        this.cursorPos = text.length;
        this._refreshLine();
    }

    _killChild() {
        if (this.childProc) {
            this.childProc.kill();
            this.childProc = null;
        }
    }

    _banner() {
        const lines = [
            '',
            '\x1b[1;36m  ╔═══════════════════════════════════════════╗\x1b[0m',
            '\x1b[1;36m  ║\x1b[0m  \x1b[1;97mAI Terminal Assistant v2.0\x1b[0m               \x1b[1;36m║\x1b[0m',
            '\x1b[1;36m  ║\x1b[0m  \x1b[90mType English \x1b[33m>\x1b[90m Get Commands \x1b[33m>\x1b[90m Auto-Run\x1b[0m   \x1b[1;36m║\x1b[0m',
            '\x1b[1;36m  ╚═══════════════════════════════════════════╝\x1b[0m',
            '',
            '\x1b[90m  Type in plain English and commands are auto-detected.\x1b[0m',
            '\x1b[90m  Real commands (git, docker, etc.) run directly.\x1b[0m',
            '\x1b[90m  Type \x1b[97mhelp\x1b[90m for more info.\x1b[0m',
            '',
        ];
        this._write(lines.join('\r\n'));
    }

    _showHelp() {
        const lines = [
            '',
            '\x1b[1;97m  HOW IT WORKS\x1b[0m',
            '',
            '   \x1b[36m1.\x1b[0m Type in \x1b[1mplain English\x1b[0m \x1b[90m(auto-translated & executed)\x1b[0m',
            '   \x1b[36m2.\x1b[0m Type \x1b[1mreal commands\x1b[0m    \x1b[90m(executed directly)\x1b[0m',
            '',
            '\x1b[1;97m  BUILT-IN COMMANDS\x1b[0m',
            '',
            '   \x1b[33mclear\x1b[0m     Clear screen',
            '   \x1b[33mhistory\x1b[0m   Show translation history',
            '   \x1b[33mhelp\x1b[0m      Show this help',
            '   \x1b[33mexit\x1b[0m      Close terminal',
            '   \x1b[33mCtrl+C\x1b[0m    Cancel current operation',
            '',
            '\x1b[1;97m  EXAMPLES\x1b[0m',
            '',
            '   \x1b[33mcreate a new git branch called feature-auth\x1b[0m',
            '   \x1b[33mbuild docker image and run on port 3000\x1b[0m',
            '   \x1b[33mfind all python files modified today\x1b[0m',
            '   \x1b[33minstall streamlit and run my dashboard\x1b[0m',
            '   \x1b[33mshow disk usage sorted by size\x1b[0m',
            '   \x1b[33mcompress the src folder into a zip\x1b[0m',
            '',
        ];
        this._write(lines.join('\r\n'));
        this._prompt();
    }

    _showHistory() {
        const entries = this.historyManager.getRecent(15);
        if (!entries.length) {
            this._write('\r\n\x1b[90m  No history yet. Translate something first!\x1b[0m\r\n\r\n');
            this._prompt();
            return;
        }

        this._write('\r\n\x1b[1;97m  TRANSLATION HISTORY\x1b[0m\r\n\r\n');
        entries.forEach((e, i) => {
            this._write(`   \x1b[90m${i + 1}.\x1b[0m \x1b[37m${e.input}\x1b[0m\r\n`);
            this._write(`      \x1b[1;36m$ ${e.command}\x1b[0m\r\n`);
        });
        this._write('\r\n');
        this._prompt();
    }
}

/**
 * Creates and shows a new AI Terminal instance.
 */
function createAITerminal(aiService, historyManager) {
    const pty = new AITerminalPty(aiService, historyManager);
    const terminal = vscode.window.createTerminal({
        name: 'AI Terminal',
        pty,
        iconPath: new vscode.ThemeIcon('zap'),
    });
    terminal.show();
    return terminal;
}

module.exports = { AITerminalPty, createAITerminal };
