const vscode = require('vscode');
const { STABLE_MODELS } = require('./aiService');

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

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHTML();

        // Send initial state
        this._sendState();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'selectProvider': {
                    await vscode.workspace.getConfiguration('aiTerminal')
                        .update('apiProvider', msg.provider, vscode.ConfigurationTarget.Global);
                    await this._sendState();
                    break;
                }
                case 'saveApiKey': {
                    const { provider, key } = msg;
                    if (!key || !key.trim()) {
                        this._postMessage({ type: 'toast', text: 'Please enter an API key', variant: 'error' });
                        return;
                    }
                    await this.aiService.setApiKey(provider, key.trim());
                    this._postMessage({ type: 'toast', text: `API key saved for ${provider}!`, variant: 'success' });
                    await this._sendState();
                    break;
                }
                case 'deleteApiKey': {
                    await this.aiService.deleteApiKey(msg.provider);
                    this._postMessage({ type: 'toast', text: 'API key removed', variant: 'info' });
                    await this._sendState();
                    break;
                }
                case 'openTerminal': {
                    vscode.commands.executeCommand('aiTerminal.openSmartTerminal');
                    break;
                }
                case 'getState': {
                    await this._sendState();
                    break;
                }
            }
        });
    }

    async _sendState() {
        const config = vscode.workspace.getConfiguration('aiTerminal');
        const provider = config.get('apiProvider', 'gemini');
        const hasKey = await this.aiService.hasApiKey(provider);
        const model = STABLE_MODELS[provider] || '';

        this._postMessage({
            type: 'state',
            provider,
            hasKey,
            model,
        });
    }

    _postMessage(msg) {
        if (this._view) {
            this._view.webview.postMessage(msg);
        }
    }

    _getHTML() {
        return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Terminal Setup</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    :root {
        --bg-primary: #0d1117;
        --bg-secondary: #161b22;
        --bg-card: #1c2129;
        --bg-card-hover: #22272e;
        --bg-input: #0d1117;
        --border: #30363d;
        --border-focus: #58a6ff;
        --text-primary: #e6edf3;
        --text-secondary: #8b949e;
        --text-muted: #6e7681;
        --accent-blue: #58a6ff;
        --accent-green: #3fb950;
        --accent-purple: #bc8cff;
        --accent-orange: #d29922;
        --accent-red: #f85149;
        --accent-cyan: #56d4dd;
        --radius: 12px;
        --radius-sm: 8px;
    }

    * {
        margin: 0; padding: 0; box-sizing: border-box;
    }

    body {
        font-family: 'Inter', -apple-system, sans-serif;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 13px;
        line-height: 1.5;
        padding: 0;
        overflow-x: hidden;
    }

    /* ═══ Header ═══ */
    .header {
        background: linear-gradient(135deg, #1a1f35 0%, #0d1117 100%);
        border-bottom: 1px solid var(--border);
        padding: 20px 16px;
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
        background: radial-gradient(ellipse at 30% 50%, rgba(88,166,255,0.06) 0%, transparent 60%),
                    radial-gradient(ellipse at 70% 50%, rgba(188,140,255,0.06) 0%, transparent 60%);
        animation: headerGlow 8s ease-in-out infinite alternate;
    }

    @keyframes headerGlow {
        0% { transform: translate(0, 0); }
        100% { transform: translate(5%, -5%); }
    }

    .header-content {
        position: relative;
        z-index: 1;
    }

    .logo {
        font-size: 28px;
        margin-bottom: 4px;
    }

    .header h1 {
        font-size: 16px;
        font-weight: 800;
        background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.3px;
    }

    .header p {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 2px;
    }

    /* ═══ Content ═══ */
    .content {
        padding: 16px;
    }

    .section {
        margin-bottom: 20px;
    }

    .section-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 1.2px;
        margin-bottom: 10px;
    }

    /* ═══ Provider Grid ═══ */
    .provider-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .provider-card {
        position: relative;
        background: var(--bg-card);
        border: 1.5px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 12px 10px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        overflow: hidden;
    }

    .provider-card:hover {
        background: var(--bg-card-hover);
        border-color: #484f58;
        transform: translateY(-1px);
    }

    .provider-card.active {
        border-color: var(--accent-blue);
        background: rgba(88,166,255,0.06);
        box-shadow: 0 0 20px rgba(88,166,255,0.08);
    }

    .provider-card.active::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
    }

    .provider-icon {
        font-size: 22px;
        display: block;
        margin-bottom: 4px;
    }

    .provider-name {
        font-size: 11px;
        font-weight: 700;
        color: var(--text-primary);
    }

    .provider-model {
        font-size: 9px;
        color: var(--text-muted);
        margin-top: 2px;
        font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .provider-card .check {
        position: absolute;
        top: 5px;
        right: 5px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent-green);
        color: white;
        font-size: 10px;
        display: none;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        box-shadow: 0 2px 6px rgba(63,185,80,0.3);
    }

    .provider-card.has-key .check {
        display: flex;
    }

    .provider-card.full-width {
        grid-column: 1 / -1;
    }

    /* ═══ Status Bar ═══ */
    .status-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        margin-bottom: 16px;
    }

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .status-dot.online {
        background: var(--accent-green);
        box-shadow: 0 0 8px rgba(63,185,80,0.5);
        animation: pulse 2s ease-in-out infinite;
    }

    .status-dot.offline {
        background: var(--accent-red);
        box-shadow: 0 0 8px rgba(248,81,73,0.3);
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    .status-text {
        flex: 1;
        font-size: 12px;
        font-weight: 600;
    }

    .status-text.online { color: var(--accent-green); }
    .status-text.offline { color: var(--accent-red); }

    .status-model {
        font-size: 10px;
        color: var(--text-muted);
        font-family: monospace;
    }

    /* ═══ API Key Field ═══ */
    .key-field {
        margin-bottom: 10px;
    }

    .key-input-row {
        display: flex;
        gap: 6px;
    }

    .key-input {
        flex: 1;
        padding: 10px 12px;
        background: var(--bg-input);
        border: 1.5px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-size: 12px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        outline: none;
        transition: border-color 0.2s;
    }

    .key-input:focus {
        border-color: var(--accent-blue);
        box-shadow: 0 0 0 3px rgba(88,166,255,0.1);
    }

    .key-input::placeholder {
        color: var(--text-muted);
        font-family: 'Inter', sans-serif;
    }

    /* ═══ Buttons ═══ */
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        border: none;
        border-radius: var(--radius-sm);
        font-size: 12px;
        font-weight: 700;
        font-family: 'Inter', sans-serif;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .btn-primary {
        background: linear-gradient(135deg, var(--accent-blue), #4090e0);
        color: white;
        box-shadow: 0 2px 8px rgba(88,166,255,0.2);
    }

    .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(88,166,255,0.3);
    }

    .btn-save {
        padding: 10px 14px;
        background: var(--accent-green);
        color: white;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(63,185,80,0.2);
    }

    .btn-save:hover {
        background: #46c25a;
        transform: translateY(-1px);
    }

    .btn-open-terminal {
        width: 100%;
        padding: 14px;
        font-size: 14px;
        font-weight: 800;
        background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
        color: white;
        box-shadow: 0 4px 20px rgba(88,166,255,0.2);
        border-radius: var(--radius);
        letter-spacing: -0.2px;
    }

    .btn-open-terminal:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 24px rgba(88,166,255,0.35);
    }

    .btn-danger-sm {
        padding: 4px 10px;
        font-size: 10px;
        background: rgba(248,81,73,0.1);
        color: var(--accent-red);
        border: 1px solid rgba(248,81,73,0.2);
    }

    .btn-danger-sm:hover {
        background: rgba(248,81,73,0.2);
    }

    /* ═══ Info Card ═══ */
    .info-card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 12px;
        margin-top: 16px;
    }

    .info-card h4 {
        font-size: 11px;
        font-weight: 700;
        color: var(--text-secondary);
        margin-bottom: 8px;
    }

    .info-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 6px;
        line-height: 1.4;
    }

    .info-item .dot {
        color: var(--accent-cyan);
        font-weight: bold;
        flex-shrink: 0;
    }

    /* ═══ Toast ═══ */
    .toast {
        position: fixed;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%) translateY(60px);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        z-index: 100;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        white-space: nowrap;
    }

    .toast.show {
        transform: translateX(-50%) translateY(0);
    }

    .toast.success {
        background: var(--accent-green);
        color: white;
    }

    .toast.error {
        background: var(--accent-red);
        color: white;
    }

    .toast.info {
        background: var(--accent-blue);
        color: white;
    }

    /* ═══ Ollama field ═══ */
    .ollama-field {
        display: none;
        margin-top: 10px;
    }

    .ollama-field.visible {
        display: block;
    }

    .ollama-label {
        font-size: 10px;
        color: var(--text-muted);
        margin-bottom: 4px;
    }

    .ollama-input {
        width: 100%;
        padding: 8px 10px;
        background: var(--bg-input);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 11px;
        font-family: monospace;
        outline: none;
    }

    .ollama-input:focus {
        border-color: var(--accent-blue);
    }

    /* ═══ Divider ═══ */
    .divider {
        height: 1px;
        background: var(--border);
        margin: 18px 0;
    }

    .kbd {
        display: inline-block;
        padding: 1px 5px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 4px;
        font-family: monospace;
        font-size: 10px;
        color: var(--text-secondary);
    }
</style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <div class="header-content">
            <div class="logo">&#9889;</div>
            <h1>AI Terminal</h1>
            <p>Setup &amp; Configuration</p>
        </div>
    </div>

    <div class="content">
        <!-- Open Terminal Button -->
        <button class="btn btn-open-terminal" id="openTerminalBtn">
            &#9889; Open AI Terminal
        </button>

        <div style="text-align:center; margin-top:6px;">
            <span style="font-size:10px; color:var(--text-muted);">
                or press <span class="kbd">Ctrl+Shift+I</span>
            </span>
        </div>

        <div class="divider"></div>

        <!-- Status -->
        <div class="status-bar" id="statusBar">
            <span class="status-dot offline" id="statusDot"></span>
            <span class="status-text offline" id="statusText">Not configured</span>
            <span class="status-model" id="statusModel"></span>
        </div>

        <!-- Provider Selection -->
        <div class="section">
            <div class="section-label">AI Provider</div>
            <div class="provider-grid" id="providerGrid">
                <div class="provider-card" data-provider="openai">
                    <span class="provider-icon">&#129302;</span>
                    <div class="provider-name">OpenAI</div>
                    <div class="provider-model">gpt-4o-mini</div>
                    <span class="check">&#10003;</span>
                </div>
                <div class="provider-card" data-provider="gemini">
                    <span class="provider-icon">&#128142;</span>
                    <div class="provider-name">Gemini</div>
                    <div class="provider-model">gemini-2.0-flash</div>
                    <span class="check">&#10003;</span>
                </div>
                <div class="provider-card" data-provider="groq">
                    <span class="provider-icon">&#9889;</span>
                    <div class="provider-name">Groq</div>
                    <div class="provider-model">llama-3.3-70b</div>
                    <span class="check">&#10003;</span>
                </div>
                <div class="provider-card" data-provider="anthropic">
                    <span class="provider-icon">&#129504;</span>
                    <div class="provider-name">Anthropic</div>
                    <div class="provider-model">claude-3.5-sonnet</div>
                    <span class="check">&#10003;</span>
                </div>
                <div class="provider-card full-width" data-provider="ollama">
                    <span class="provider-icon">&#129433;</span>
                    <div class="provider-name">Ollama (Local)</div>
                    <div class="provider-model">llama3.2 &bull; No key needed</div>
                    <span class="check">&#10003;</span>
                </div>
            </div>
        </div>

        <!-- API Key -->
        <div class="section" id="apiKeySection">
            <div class="section-label">API Key</div>
            <div class="key-field">
                <div class="key-input-row">
                    <input type="password" class="key-input" id="apiKeyInput"
                        placeholder="Paste your API key here..." />
                    <button class="btn btn-save" id="saveKeyBtn">Save</button>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;">
                <button class="btn btn-danger-sm" id="deleteKeyBtn">Remove Key</button>
            </div>
        </div>

        <!-- Ollama endpoint -->
        <div class="ollama-field" id="ollamaField">
            <div class="ollama-label">Ollama Endpoint</div>
            <input class="ollama-input" id="ollamaInput" value="http://localhost:11434" />
        </div>

        <!-- Info -->
        <div class="info-card">
            <h4>How it works</h4>
            <div class="info-item">
                <span class="dot">1.</span>
                <span>Choose a provider &amp; enter your API key above</span>
            </div>
            <div class="info-item">
                <span class="dot">2.</span>
                <span>Open the AI Terminal (button above or <span class="kbd">Ctrl+Shift+I</span>)</span>
            </div>
            <div class="info-item">
                <span class="dot">3.</span>
                <span>Type in plain English &mdash; commands auto-translate and execute</span>
            </div>
            <div class="info-item">
                <span class="dot">4.</span>
                <span>Real commands (git, docker, etc.) pass through directly</span>
            </div>
        </div>
    </div>

    <!-- Toast -->
    <div class="toast" id="toast"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentProvider = 'gemini';

        // ── Event Listeners ──
        document.getElementById('openTerminalBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'openTerminal' });
        });

        document.querySelectorAll('.provider-card').forEach(card => {
            card.addEventListener('click', () => {
                const provider = card.dataset.provider;
                currentProvider = provider;
                vscode.postMessage({ type: 'selectProvider', provider });
            });
        });

        document.getElementById('saveKeyBtn').addEventListener('click', () => {
            const key = document.getElementById('apiKeyInput').value;
            vscode.postMessage({ type: 'saveApiKey', provider: currentProvider, key });
            document.getElementById('apiKeyInput').value = '';
        });

        document.getElementById('deleteKeyBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'deleteApiKey', provider: currentProvider });
        });

        document.getElementById('apiKeyInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('saveKeyBtn').click();
            }
        });

        // ── Handle messages from extension ──
        window.addEventListener('message', (event) => {
            const msg = event.data;

            if (msg.type === 'state') {
                currentProvider = msg.provider;

                // Update provider cards
                document.querySelectorAll('.provider-card').forEach(c => {
                    c.classList.toggle('active', c.dataset.provider === msg.provider);
                });

                // Status
                const dot = document.getElementById('statusDot');
                const text = document.getElementById('statusText');
                const model = document.getElementById('statusModel');

                if (msg.hasKey) {
                    dot.className = 'status-dot online';
                    text.className = 'status-text online';
                    text.textContent = 'Connected';
                } else {
                    dot.className = 'status-dot offline';
                    text.className = 'status-text offline';
                    text.textContent = 'API key needed';
                }
                model.textContent = msg.model || '';

                // Show/hide API key section for Ollama
                const isOllama = msg.provider === 'ollama';
                document.getElementById('apiKeySection').style.display = isOllama ? 'none' : 'block';
                document.getElementById('ollamaField').classList.toggle('visible', isOllama);

                if (isOllama) {
                    dot.className = 'status-dot online';
                    text.className = 'status-text online';
                    text.textContent = 'Local mode';
                }
            }

            if (msg.type === 'toast') {
                showToast(msg.text, msg.variant || 'info');
            }
        });

        function showToast(text, variant) {
            const el = document.getElementById('toast');
            el.textContent = text;
            el.className = 'toast ' + variant + ' show';
            setTimeout(() => { el.classList.remove('show'); }, 2500);
        }

        // Request initial state
        vscode.postMessage({ type: 'getState' });
    </script>
</body>
</html>`;
    }
}

module.exports = { SidebarProvider };
