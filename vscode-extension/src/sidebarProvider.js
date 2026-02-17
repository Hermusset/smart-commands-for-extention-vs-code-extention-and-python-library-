const vscode = require('vscode');

class SidebarProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {import('./aiService').AIService} aiService
     * @param {import('./historyManager').HistoryManager} historyManager
     */
    constructor(context, aiService, historyManager) {
        this.context = context;
        this.aiService = aiService;
        this.historyManager = historyManager;
        this._view = null;
    }

    /**
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'saveApiKey': {
                    await this.aiService.setApiKey(message.provider, message.key);
                    vscode.window.showInformationMessage(
                        `✅ ${message.provider} API key saved securely!`
                    );
                    this._sendMessage({ type: 'keySaved', provider: message.provider });
                    break;
                }
                case 'translate': {
                    try {
                        const result = await this.aiService.translateToCommand(message.input);
                        this.historyManager.addEntry({
                            input: message.input,
                            command: result.command,
                            explanation: result.explanation,
                            provider: vscode.workspace.getConfiguration('aiTerminal').get('apiProvider', 'openai'),
                            timestamp: new Date().toLocaleString(),
                        });
                        this._sendMessage({
                            type: 'translationResult',
                            result,
                            input: message.input,
                        });
                    } catch (error) {
                        this._sendMessage({
                            type: 'error',
                            message: error.message,
                        });
                    }
                    break;
                }
                case 'runCommand': {
                    let terminal = vscode.window.activeTerminal;
                    if (!terminal) {
                        terminal = vscode.window.createTerminal('AI Terminal');
                    }
                    terminal.show();
                    terminal.sendText(message.command);
                    break;
                }
                case 'copyCommand': {
                    await vscode.env.clipboard.writeText(message.command);
                    vscode.window.showInformationMessage('📋 Command copied to clipboard!');
                    break;
                }
                case 'getHistory': {
                    const history = this.historyManager.getRecent(20);
                    this._sendMessage({ type: 'historyData', history });
                    break;
                }
                case 'clearHistory': {
                    this.historyManager.clearHistory();
                    this._sendMessage({ type: 'historyCleared' });
                    break;
                }
                case 'getConfig': {
                    const config = vscode.workspace.getConfiguration('aiTerminal');
                    this._sendMessage({
                        type: 'configData',
                        config: {
                            apiProvider: config.get('apiProvider', 'openai'),
                            model: config.get('model', 'gpt-4o-mini'),
                            autoExecute: config.get('autoExecute', false),
                            shell: config.get('shell', 'auto'),
                        },
                    });
                    break;
                }
                case 'updateConfig': {
                    const cfg = vscode.workspace.getConfiguration('aiTerminal');
                    await cfg.update(message.key, message.value, vscode.ConfigurationTarget.Global);
                    break;
                }
                case 'checkApiKey': {
                    const key = await this.aiService.getApiKey(message.provider);
                    this._sendMessage({
                        type: 'apiKeyStatus',
                        provider: message.provider,
                        hasKey: !!key,
                    });
                    break;
                }
            }
        });
    }

    _sendMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    _getHtml(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Terminal Assistant</title>
    <style>
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border-color: #30363d;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --accent-blue: #58a6ff;
            --accent-green: #3fb950;
            --accent-purple: #bc8cff;
            --accent-orange: #d29922;
            --accent-red: #f85149;
            --accent-gradient: linear-gradient(135deg, #58a6ff, #bc8cff);
            --radius: 8px;
            --shadow: 0 2px 8px rgba(0,0,0,0.3);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 13px;
            line-height: 1.5;
            padding: 0;
            overflow-x: hidden;
        }

        /* Header */
        .header {
            background: var(--accent-gradient);
            padding: 16px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: shimmer 4s ease-in-out infinite;
        }

        @keyframes shimmer {
            0%, 100% { transform: translateX(-30%) translateY(-30%); }
            50% { transform: translateX(30%) translateY(30%); }
        }

        .header h1 {
            font-size: 16px;
            font-weight: 700;
            position: relative;
            z-index: 1;
            text-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        .header p {
            font-size: 11px;
            opacity: 0.9;
            position: relative;
            z-index: 1;
            margin-top: 2px;
        }

        /* Tabs */
        .tabs {
            display: flex;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
        }

        .tab {
            flex: 1;
            padding: 10px 8px;
            text-align: center;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-secondary);
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
            background: none;
            border-top: none;
            border-left: none;
            border-right: none;
        }

        .tab:hover {
            color: var(--text-primary);
            background: var(--bg-tertiary);
        }

        .tab.active {
            color: var(--accent-blue);
            border-bottom-color: var(--accent-blue);
        }

        /* Tab Content */
        .tab-content {
            display: none;
            padding: 12px;
            animation: fadeIn 0.2s ease;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Input section */
        .input-group {
            margin-bottom: 12px;
        }

        .input-group label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
        }

        input[type="text"], input[type="password"], select, textarea {
            width: 100%;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 13px;
            font-family: inherit;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            outline: none;
        }

        input:focus, select:focus, textarea:focus {
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
        }

        textarea {
            resize: vertical;
            min-height: 70px;
        }

        select {
            cursor: pointer;
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: var(--radius);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
            font-family: inherit;
        }

        .btn-primary {
            background: var(--accent-gradient);
            color: white;
            width: 100%;
        }

        .btn-primary:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .btn-secondary {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: var(--border-color);
        }

        .btn-danger {
            background: rgba(248, 81, 73, 0.15);
            color: var(--accent-red);
            border: 1px solid rgba(248, 81, 73, 0.3);
        }

        .btn-danger:hover {
            background: rgba(248, 81, 73, 0.25);
        }

        .btn-sm {
            padding: 4px 10px;
            font-size: 11px;
        }

        .btn-icon {
            padding: 6px;
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .btn-icon:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        /* Result card */
        .result-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            margin-top: 12px;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .result-header {
            padding: 8px 12px;
            background: var(--bg-tertiary);
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-color);
        }

        .result-header span {
            font-size: 11px;
            font-weight: 600;
            color: var(--accent-green);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .result-command {
            padding: 12px;
            font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
            font-size: 13px;
            color: var(--accent-blue);
            word-break: break-all;
            background: rgba(88, 166, 255, 0.05);
        }

        .result-explanation {
            padding: 8px 12px;
            font-size: 12px;
            color: var(--text-secondary);
            border-top: 1px solid var(--border-color);
        }

        .result-warning {
            padding: 8px 12px;
            font-size: 12px;
            color: var(--accent-orange);
            background: rgba(210, 153, 34, 0.1);
            border-top: 1px solid rgba(210, 153, 34, 0.3);
        }

        .result-actions {
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            border-top: 1px solid var(--border-color);
        }

        .result-actions .btn {
            flex: 1;
        }

        /* History list */
        .history-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius);
            padding: 10px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .history-item:hover {
            border-color: var(--accent-blue);
            transform: translateX(2px);
        }

        .history-input {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }

        .history-command {
            font-family: 'Cascadia Code', 'Fira Code', monospace;
            font-size: 12px;
            color: var(--accent-blue);
        }

        .history-meta {
            font-size: 10px;
            color: var(--text-secondary);
            opacity: 0.7;
            margin-top: 4px;
        }

        /* Provider pills */
        .provider-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-bottom: 12px;
        }

        .provider-pill {
            padding: 8px;
            border-radius: var(--radius);
            border: 1px solid var(--border-color);
            background: var(--bg-secondary);
            text-align: center;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s ease;
        }

        .provider-pill:hover {
            border-color: var(--accent-blue);
        }

        .provider-pill.active {
            border-color: var(--accent-blue);
            background: rgba(88, 166, 255, 0.1);
            color: var(--accent-blue);
        }

        .provider-pill.has-key::after {
            content: ' ✓';
            color: var(--accent-green);
        }

        /* Status badge */
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
        }

        .status-badge.connected {
            background: rgba(63, 185, 80, 0.15);
            color: var(--accent-green);
        }

        .status-badge.disconnected {
            background: rgba(248, 81, 73, 0.15);
            color: var(--accent-red);
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-dot.connected {
            background: var(--accent-green);
            box-shadow: 0 0 6px var(--accent-green);
        }

        .status-dot.disconnected {
            background: var(--accent-red);
        }

        /* Loading spinner */
        .spinner {
            display: none;
            text-align: center;
            padding: 20px;
        }

        .spinner.active {
            display: block;
        }

        .spinner-ring {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border-color);
            border-top-color: var(--accent-blue);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 8px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .spinner-text {
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* Empty state */
        .empty-state {
            text-align: center;
            padding: 30px 20px;
            color: var(--text-secondary);
        }

        .empty-state .icon {
            font-size: 32px;
            margin-bottom: 8px;
        }

        .empty-state p {
            font-size: 12px;
        }

        /* Divider */
        .divider {
            height: 1px;
            background: var(--border-color);
            margin: 12px 0;
        }

        /* Toggle */
        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
        }

        .toggle-label {
            font-size: 12px;
            color: var(--text-primary);
        }

        .toggle-desc {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .toggle {
            position: relative;
            width: 36px;
            height: 20px;
            flex-shrink: 0;
        }

        .toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            transition: 0.2s;
        }

        .toggle-slider::before {
            content: '';
            position: absolute;
            width: 14px;
            height: 14px;
            left: 2px;
            bottom: 2px;
            background: var(--text-secondary);
            border-radius: 50%;
            transition: 0.2s;
        }

        .toggle input:checked + .toggle-slider {
            background: var(--accent-blue);
            border-color: var(--accent-blue);
        }

        .toggle input:checked + .toggle-slider::before {
            transform: translateX(16px);
            background: white;
        }

        /* Tech badges */
        .tech-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 8px;
        }

        .tech-badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
        }

        .password-wrapper {
            position: relative;
        }

        .password-toggle {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 14px;
            padding: 4px;
        }

        .password-toggle:hover {
            color: var(--text-primary);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ AI Terminal Assistant</h1>
        <p>Natural English → Terminal Commands</p>
    </div>

    <div class="tabs">
        <button class="tab active" data-tab="translate" id="tab-translate">💬 Translate</button>
        <button class="tab" data-tab="settings" id="tab-settings">⚙️ Settings</button>
        <button class="tab" data-tab="history" id="tab-history">📜 History</button>
    </div>

    <!-- Translate Tab -->
    <div class="tab-content active" id="content-translate">
        <div class="input-group">
            <label>What do you want to do?</label>
            <textarea id="naturalInput" placeholder="e.g., create a new git branch called feature-auth and push it to remote"></textarea>
        </div>
        <button class="btn btn-primary" id="translateBtn" onclick="translateCommand()">
            ⚡ Translate to Command
        </button>

        <div class="spinner" id="loadingSpinner">
            <div class="spinner-ring"></div>
            <div class="spinner-text">Translating your request...</div>
        </div>

        <div id="resultContainer"></div>

        <div class="divider"></div>

        <div style="margin-top: 8px;">
            <label style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Supported Technologies</label>
            <div class="tech-grid">
                <span class="tech-badge">Git</span>
                <span class="tech-badge">Docker</span>
                <span class="tech-badge">Python</span>
                <span class="tech-badge">Node.js</span>
                <span class="tech-badge">SQL</span>
                <span class="tech-badge">MongoDB</span>
                <span class="tech-badge">C/C++</span>
                <span class="tech-badge">Java</span>
                <span class="tech-badge">Rust</span>
                <span class="tech-badge">Go</span>
                <span class="tech-badge">K8s</span>
                <span class="tech-badge">Terraform</span>
                <span class="tech-badge">Streamlit</span>
                <span class="tech-badge">AWS</span>
                <span class="tech-badge">Azure</span>
                <span class="tech-badge">GCloud</span>
                <span class="tech-badge">Ansible</span>
                <span class="tech-badge">Helm</span>
            </div>
        </div>
    </div>

    <!-- Settings Tab -->
    <div class="tab-content" id="content-settings">
        <div class="input-group">
            <label>AI Provider</label>
            <div class="provider-grid" id="providerGrid">
                <div class="provider-pill active" data-provider="openai" onclick="selectProvider('openai')">OpenAI</div>
                <div class="provider-pill" data-provider="gemini" onclick="selectProvider('gemini')">Gemini</div>
                <div class="provider-pill" data-provider="anthropic" onclick="selectProvider('anthropic')">Anthropic</div>
                <div class="provider-pill" data-provider="groq" onclick="selectProvider('groq')">Groq</div>
                <div class="provider-pill" data-provider="ollama" onclick="selectProvider('ollama')">Ollama</div>
            </div>
        </div>

        <div class="input-group" id="apiKeyGroup">
            <label>API Key</label>
            <div class="password-wrapper">
                <input type="password" id="apiKeyInput" placeholder="Enter your API key..." />
                <button class="password-toggle" onclick="togglePasswordVisibility()" id="passwordToggle">👁</button>
            </div>
            <div style="margin-top: 4px;">
                <span class="status-badge disconnected" id="keyStatus">
                    <span class="status-dot disconnected"></span>
                    Not configured
                </span>
            </div>
        </div>

        <button class="btn btn-primary" onclick="saveApiKey()" style="margin-bottom: 12px;">
            🔐 Save API Key Securely
        </button>

        <div class="input-group">
            <label>Model</label>
            <input type="text" id="modelInput" placeholder="e.g., gpt-4o-mini, gemini-2.0-flash" />
        </div>

        <div class="input-group">
            <label>Target Shell</label>
            <select id="shellSelect" onchange="updateConfig('shell', this.value)">
                <option value="auto">Auto Detect</option>
                <option value="powershell">PowerShell</option>
                <option value="cmd">CMD</option>
                <option value="bash">Bash</option>
                <option value="zsh">Zsh</option>
            </select>
        </div>

        <div class="toggle-row">
            <div>
                <div class="toggle-label">Auto Execute</div>
                <div class="toggle-desc">Run commands without confirmation (⚠️ risky)</div>
            </div>
            <label class="toggle">
                <input type="checkbox" id="autoExecuteToggle" onchange="updateConfig('autoExecute', this.checked)" />
                <span class="toggle-slider"></span>
            </label>
        </div>

        <div class="divider"></div>

        <div id="ollamaSettings" style="display: none;">
            <div class="input-group">
                <label>Ollama Endpoint</label>
                <input type="text" id="ollamaEndpoint" placeholder="http://localhost:11434" value="http://localhost:11434" />
            </div>
            <button class="btn btn-secondary btn-sm" onclick="updateConfig('ollamaEndpoint', document.getElementById('ollamaEndpoint').value)">
                Save Endpoint
            </button>
        </div>
    </div>

    <!-- History Tab -->
    <div class="tab-content" id="content-history">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <label style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Recent Commands</label>
            <button class="btn btn-danger btn-sm" onclick="clearHistory()">Clear All</button>
        </div>
        <div id="historyList">
            <div class="empty-state">
                <div class="icon">📜</div>
                <p>No commands yet.<br>Try translating something!</p>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentProvider = 'openai';

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('content-' + tab.dataset.tab).classList.add('active');

                if (tab.dataset.tab === 'history') {
                    vscode.postMessage({ type: 'getHistory' });
                }
            });
        });

        // Translate command
        function translateCommand() {
            const input = document.getElementById('naturalInput').value.trim();
            if (!input) return;

            document.getElementById('loadingSpinner').classList.add('active');
            document.getElementById('resultContainer').innerHTML = '';
            document.getElementById('translateBtn').disabled = true;

            vscode.postMessage({ type: 'translate', input });
        }

        // Keyboard shortcut in textarea
        document.getElementById('naturalInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                translateCommand();
            }
        });

        // Provider selection
        function selectProvider(provider) {
            currentProvider = provider;
            document.querySelectorAll('.provider-pill').forEach(p => p.classList.remove('active'));
            document.querySelector(\`[data-provider="\${provider}"]\`).classList.add('active');

            // Show/hide Ollama settings
            document.getElementById('ollamaSettings').style.display = provider === 'ollama' ? 'block' : 'none';
            document.getElementById('apiKeyGroup').style.display = provider === 'ollama' ? 'none' : 'block';

            // Update model placeholder
            const modelDefaults = {
                openai: 'gpt-4o-mini',
                gemini: 'gemini-2.0-flash',
                anthropic: 'claude-3-5-sonnet-20241022',
                groq: 'llama-3.3-70b-versatile',
                ollama: 'llama3.2'
            };
            document.getElementById('modelInput').placeholder = modelDefaults[provider] || '';

            updateConfig('apiProvider', provider);
            vscode.postMessage({ type: 'checkApiKey', provider });
        }

        // Save API key
        function saveApiKey() {
            const key = document.getElementById('apiKeyInput').value.trim();
            if (!key) return;
            vscode.postMessage({ type: 'saveApiKey', provider: currentProvider, key });
            document.getElementById('apiKeyInput').value = '';
        }

        // Toggle password
        function togglePasswordVisibility() {
            const input = document.getElementById('apiKeyInput');
            const toggle = document.getElementById('passwordToggle');
            if (input.type === 'password') {
                input.type = 'text';
                toggle.textContent = '🙈';
            } else {
                input.type = 'password';
                toggle.textContent = '👁';
            }
        }

        // Update config
        function updateConfig(key, value) {
            vscode.postMessage({ type: 'updateConfig', key, value });
        }

        // Clear history
        function clearHistory() {
            vscode.postMessage({ type: 'clearHistory' });
        }

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'translationResult': {
                    showResult(msg.result, msg.input);
                    break;
                }
                case 'error': {
                    document.getElementById('loadingSpinner').classList.remove('active');
                    document.getElementById('translateBtn').disabled = false;
                    document.getElementById('resultContainer').innerHTML = \`
                        <div class="result-card" style="border-color: var(--accent-red);">
                            <div class="result-header">
                                <span style="color: var(--accent-red);">❌ Error</span>
                            </div>
                            <div class="result-explanation" style="color: var(--accent-red);">\${escapeHtml(msg.message)}</div>
                        </div>
                    \`;
                    break;
                }
                case 'keySaved': {
                    updateKeyStatus(true);
                    break;
                }
                case 'apiKeyStatus': {
                    updateKeyStatus(msg.hasKey);
                    // Update pill
                    const pill = document.querySelector(\`[data-provider="\${msg.provider}"]\`);
                    if (pill) {
                        pill.classList.toggle('has-key', msg.hasKey);
                    }
                    break;
                }
                case 'historyData': {
                    renderHistory(msg.history);
                    break;
                }
                case 'historyCleared': {
                    document.getElementById('historyList').innerHTML = \`
                        <div class="empty-state">
                            <div class="icon">📜</div>
                            <p>History cleared!</p>
                        </div>
                    \`;
                    break;
                }
                case 'configData': {
                    applyConfig(msg.config);
                    break;
                }
            }
        });

        function showResult(result, input) {
            document.getElementById('loadingSpinner').classList.remove('active');
            document.getElementById('translateBtn').disabled = false;

            let warningHtml = '';
            if (result.warning) {
                warningHtml = \`<div class="result-warning">⚠️ \${escapeHtml(result.warning)}</div>\`;
            }

            document.getElementById('resultContainer').innerHTML = \`
                <div class="result-card">
                    <div class="result-header">
                        <span>✅ Generated Command</span>
                    </div>
                    <div class="result-command">\${escapeHtml(result.command)}</div>
                    <div class="result-explanation">\${escapeHtml(result.explanation)}</div>
                    \${warningHtml}
                    <div class="result-actions">
                        <button class="btn btn-primary btn-sm" onclick="runCommand('\${escapeJs(result.command)}')">▶ Run</button>
                        <button class="btn btn-secondary btn-sm" onclick="copyCommand('\${escapeJs(result.command)}')">📋 Copy</button>
                    </div>
                </div>
            \`;
        }

        function runCommand(cmd) {
            vscode.postMessage({ type: 'runCommand', command: cmd });
        }

        function copyCommand(cmd) {
            vscode.postMessage({ type: 'copyCommand', command: cmd });
        }

        function renderHistory(history) {
            if (!history || history.length === 0) {
                document.getElementById('historyList').innerHTML = \`
                    <div class="empty-state">
                        <div class="icon">📜</div>
                        <p>No commands yet.<br>Try translating something!</p>
                    </div>
                \`;
                return;
            }

            document.getElementById('historyList').innerHTML = history.map(entry => \`
                <div class="history-item" onclick="runCommand('\${escapeJs(entry.command)}')">
                    <div class="history-input">💬 \${escapeHtml(entry.input)}</div>
                    <div class="history-command">$ \${escapeHtml(entry.command)}</div>
                    <div class="history-meta">\${escapeHtml(entry.timestamp)} · \${escapeHtml(entry.provider)}</div>
                </div>
            \`).join('');
        }

        function updateKeyStatus(hasKey) {
            const badge = document.getElementById('keyStatus');
            if (hasKey) {
                badge.className = 'status-badge connected';
                badge.innerHTML = '<span class="status-dot connected"></span> Connected';
            } else {
                badge.className = 'status-badge disconnected';
                badge.innerHTML = '<span class="status-dot disconnected"></span> Not configured';
            }
        }

        function applyConfig(config) {
            if (config.apiProvider) selectProvider(config.apiProvider);
            if (config.model) document.getElementById('modelInput').value = config.model;
            if (config.autoExecute) document.getElementById('autoExecuteToggle').checked = config.autoExecute;
            if (config.shell) document.getElementById('shellSelect').value = config.shell;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }

        function escapeJs(text) {
            return (text || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/"/g, '\\\\"');
        }

        // Initialize
        vscode.postMessage({ type: 'getConfig' });
    </script>
</body>
</html>`;
    }
}

module.exports = { SidebarProvider };
