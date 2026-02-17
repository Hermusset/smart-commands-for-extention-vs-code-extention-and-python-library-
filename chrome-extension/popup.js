// AI Terminal Assistant - Chrome Extension Popup Logic
let currentProvider = 'openai';
let settings = {};

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupEventListeners();
});

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${name}`).classList.add('active');
            if (name === 'history') loadHistory();
        });
    });

    // Provider cards
    document.querySelectorAll('.provider-card').forEach(card => {
        card.addEventListener('click', () => selectProvider(card.dataset.provider));
    });

    // Translate
    document.getElementById('translateBtn').addEventListener('click', translateCommand);
    document.getElementById('inputText').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            translateCommand();
        }
    });

    // Save key
    document.getElementById('saveKeyBtn').addEventListener('click', saveApiKey);

    // Password toggle
    document.getElementById('togglePassword').addEventListener('click', () => {
        const inp = document.getElementById('apiKeyInput');
        const btn = document.getElementById('togglePassword');
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });

    // Config changes
    document.getElementById('shellSelect').addEventListener('change', (e) => {
        settings.shell = e.target.value; saveSettings();
    });
    document.getElementById('autoExecute').addEventListener('change', (e) => {
        settings.autoExecute = e.target.checked; saveSettings();
    });
    document.getElementById('modelInput').addEventListener('change', (e) => {
        settings.model = e.target.value; saveSettings();
    });
    document.getElementById('ollamaEndpoint').addEventListener('change', (e) => {
        settings.ollamaEndpoint = e.target.value; saveSettings();
    });

    // Clear history
    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
        chrome.storage.local.set({ commandHistory: [] }, () => {
            document.getElementById('historyList').innerHTML =
                '<div class="empty-state"><div class="empty-icon">🗑️</div><h3>History cleared</h3></div>';
        });
    });
}

// ============ SETTINGS ============
function loadSettings() {
    chrome.storage.local.get(['aiTerminalSettings', 'apiKeys'], (data) => {
        settings = data.aiTerminalSettings || {
            provider: 'openai', model: '', shell: 'auto',
            autoExecute: false, ollamaEndpoint: 'http://localhost:11434'
        };
        const apiKeys = data.apiKeys || {};
        currentProvider = settings.provider || 'openai';
        selectProvider(currentProvider);

        if (settings.model) document.getElementById('modelInput').value = settings.model;
        if (settings.shell) document.getElementById('shellSelect').value = settings.shell;
        document.getElementById('autoExecute').checked = settings.autoExecute || false;
        if (settings.ollamaEndpoint) document.getElementById('ollamaEndpoint').value = settings.ollamaEndpoint;

        Object.keys(apiKeys).forEach(p => {
            if (apiKeys[p]) {
                const card = document.querySelector(`[data-provider="${p}"]`);
                if (card) card.classList.add('has-key');
            }
        });
        updateKeyStatus(!!apiKeys[currentProvider]);
    });
}

function saveSettings() {
    chrome.storage.local.set({ aiTerminalSettings: settings });
}

function selectProvider(provider) {
    currentProvider = provider;
    settings.provider = provider;
    saveSettings();

    document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`[data-provider="${provider}"]`);
    if (card) card.classList.add('active');

    document.getElementById('ollamaField').style.display = provider === 'ollama' ? 'block' : 'none';
    document.getElementById('apiKeyField').style.display = provider === 'ollama' ? 'none' : 'block';
    document.getElementById('saveKeyBtn').style.display = provider === 'ollama' ? 'none' : 'block';

    const hints = {
        openai: 'Recommended: gpt-4o-mini (fast & cheap)',
        gemini: 'Recommended: gemini-2.0-flash (free tier)',
        anthropic: 'Recommended: claude-3-5-sonnet-20241022',
        groq: 'Recommended: llama-3.3-70b-versatile (free)',
        ollama: 'Use any locally installed model'
    };
    const defaults = {
        openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash',
        anthropic: 'claude-3-5-sonnet-20241022', groq: 'llama-3.3-70b-versatile', ollama: 'llama3.2'
    };
    document.getElementById('modelHint').textContent = hints[provider] || '';
    document.getElementById('modelInput').placeholder = defaults[provider] || '';

    chrome.storage.local.get(['apiKeys'], (data) => {
        updateKeyStatus(!!(data.apiKeys || {})[provider]);
    });
}

function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) return;
    chrome.storage.local.get(['apiKeys'], (data) => {
        const keys = data.apiKeys || {};
        keys[currentProvider] = key;
        chrome.storage.local.set({ apiKeys: keys }, () => {
            document.getElementById('apiKeyInput').value = '';
            updateKeyStatus(true);
            const card = document.querySelector(`[data-provider="${currentProvider}"]`);
            if (card) card.classList.add('has-key');
            showNotification('API key saved securely! ✅');
        });
    });
}

function updateKeyStatus(hasKey) {
    const row = document.getElementById('keyStatusRow');
    row.innerHTML = hasKey
        ? '<span class="status-dot online"></span><span class="status-text online">Connected</span>'
        : '<span class="status-dot offline"></span><span class="status-text offline">Not configured</span>';
}

// ============ TRANSLATION ============
function translateCommand() {
    const input = document.getElementById('inputText').value.trim();
    if (!input) return;

    const loader = document.getElementById('loader');
    const resultArea = document.getElementById('resultArea');
    const btn = document.getElementById('translateBtn');

    loader.classList.add('active');
    resultArea.innerHTML = '';
    btn.disabled = true;

    chrome.storage.local.get(['apiKeys'], (data) => {
        const keys = data.apiKeys || {};
        const apiKey = keys[currentProvider] || '';

        if (!apiKey && currentProvider !== 'ollama') {
            loader.classList.remove('active');
            btn.disabled = false;
            resultArea.innerHTML = `<div class="error-card">
                <div class="error-title">🔑 API Key Required</div>
                <div class="error-msg">Configure your ${currentProvider} API key in Settings.</div>
            </div>`;
            return;
        }

        chrome.runtime.sendMessage({
            type: 'translate', input,
            settings: {
                provider: currentProvider, apiKey,
                model: settings.model || '',
                shell: settings.shell || 'auto',
                ollamaEndpoint: settings.ollamaEndpoint || 'http://localhost:11434'
            }
        }, (response) => {
            loader.classList.remove('active');
            btn.disabled = false;

            if (chrome.runtime.lastError) {
                showError(chrome.runtime.lastError.message);
                return;
            }
            if (response && response.success) {
                showResult(response.result);
                saveToHistory(input, response.result);
            } else {
                showError(response?.error || 'Unknown error');
            }
        });
    });
}

function showResult(result) {
    const warn = result.warning
        ? `<div class="result-warning">${esc(result.warning)}</div>` : '';
    document.getElementById('resultArea').innerHTML = `
        <div class="result-card">
            <div class="result-badge"><span class="result-badge-label">✅ Generated Command</span></div>
            <div class="result-command-box">${esc(result.command)}</div>
            <div class="result-explanation">${esc(result.explanation)}</div>
            ${warn}
            <div class="result-actions">
                <button class="btn btn-success btn-sm" id="copyBtn">📋 Copy</button>
            </div>
        </div>`;
    document.getElementById('copyBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(result.command).then(() => showNotification('Copied! 📋'));
    });
}

function showError(msg) {
    document.getElementById('resultArea').innerHTML = `
        <div class="error-card">
            <div class="error-title">❌ Error</div>
            <div class="error-msg">${esc(msg)}</div>
        </div>`;
}

// ============ HISTORY ============
function saveToHistory(input, result) {
    chrome.storage.local.get(['commandHistory'], (data) => {
        const history = data.commandHistory || [];
        history.unshift({
            input, command: result.command, explanation: result.explanation,
            provider: currentProvider, timestamp: new Date().toLocaleString()
        });
        if (history.length > 50) history.length = 50;
        chrome.storage.local.set({ commandHistory: history });
    });
}

function loadHistory() {
    chrome.storage.local.get(['commandHistory'], (data) => {
        const history = data.commandHistory || [];
        const el = document.getElementById('historyList');
        if (!history.length) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><h3>No commands yet</h3><p>Translate something to see it here!</p></div>';
            return;
        }
        el.innerHTML = history.map((e, i) => `
            <div class="history-item" data-idx="${i}">
                <div class="history-query"><span class="emoji">💬</span> ${esc(e.input)}</div>
                <div class="history-cmd">$ ${esc(e.command)}</div>
                <div class="history-meta">${esc(e.timestamp)} · ${esc(e.provider)}</div>
            </div>`).join('');
        el.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                navigator.clipboard.writeText(history[+item.dataset.idx].command)
                    .then(() => showNotification('Copied! 📋'));
            });
        });
    });
}

// ============ UTILITIES ============
function esc(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
}

function showNotification(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
        background:#3fb950;color:#fff;padding:8px 18px;border-radius:20px;font-size:12px;
        font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2000);
}
