// AI Terminal Assistant - Content Script
// Provides an overlay UI that can be triggered with keyboard shortcut

let overlay = null;

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'showOverlay') {
        toggleOverlay();
    }
});

function toggleOverlay() {
    if (overlay) {
        removeOverlay();
        return;
    }
    createOverlay();
}

function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'ai-terminal-overlay';
    overlay.innerHTML = `
        <div class="ai-term-backdrop"></div>
        <div class="ai-term-modal">
            <div class="ai-term-header">
                <span class="ai-term-logo">⚡ AI Terminal</span>
                <button class="ai-term-close" id="aiTermClose">✕</button>
            </div>
            <div class="ai-term-body">
                <input type="text" class="ai-term-input" id="aiTermInput" 
                    placeholder="Describe what you want to do in plain English..." autofocus />
                <div class="ai-term-loader" id="aiTermLoader" style="display:none;">
                    <div class="ai-term-spinner"></div>
                    <span>Translating...</span>
                </div>
                <div id="aiTermResult"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Focus input
    setTimeout(() => {
        document.getElementById('aiTermInput').focus();
    }, 100);

    // Event listeners
    document.getElementById('aiTermClose').addEventListener('click', removeOverlay);

    overlay.querySelector('.ai-term-backdrop').addEventListener('click', removeOverlay);

    document.getElementById('aiTermInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleOverlayTranslate();
        }
        if (e.key === 'Escape') {
            removeOverlay();
        }
    });
}

function removeOverlay() {
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
}

async function handleOverlayTranslate() {
    const input = document.getElementById('aiTermInput').value.trim();
    if (!input) return;

    document.getElementById('aiTermLoader').style.display = 'flex';
    document.getElementById('aiTermResult').innerHTML = '';

    chrome.storage.local.get(['aiTerminalSettings', 'apiKeys'], (data) => {
        const settings = data.aiTerminalSettings || { provider: 'ollama' };
        const keys = data.apiKeys || {};

        const translationSettings = {
            provider: settings.provider || 'ollama',
            apiKey: keys[settings.provider] || '',
            model: settings.model || '',
            shell: settings.shell || 'auto',
            ollamaEndpoint: settings.ollamaEndpoint || 'http://localhost:11434',
        };

        chrome.runtime.sendMessage(
            { type: 'translate', input, settings: translationSettings },
            (response) => {
                document.getElementById('aiTermLoader').style.display = 'none';
                if (response && response.success) {
                    const r = response.result;
                    document.getElementById('aiTermResult').innerHTML = `
                        <div class="ai-term-result-card">
                            <div class="ai-term-cmd">${escapeHtml(r.command)}</div>
                            <div class="ai-term-explain">${escapeHtml(r.explanation)}</div>
                            <button class="ai-term-copy-btn" id="aiTermCopyBtn">📋 Copy Command</button>
                        </div>
                    `;
                    document.getElementById('aiTermCopyBtn').addEventListener('click', () => {
                        navigator.clipboard.writeText(r.command);
                        document.getElementById('aiTermCopyBtn').textContent = '✅ Copied!';
                    });
                } else {
                    document.getElementById('aiTermResult').innerHTML = `
                        <div class="ai-term-error">${escapeHtml(response?.error || 'Error occurred')}</div>
                    `;
                }
            }
        );
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
