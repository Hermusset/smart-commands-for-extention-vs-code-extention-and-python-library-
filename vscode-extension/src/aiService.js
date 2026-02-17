const vscode = require('vscode');
const https = require('https');
const http = require('http');

// Auto-selected stable models per provider — user never picks these
const STABLE_MODELS = {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
    anthropic: 'claude-3-5-sonnet-20241022',
    groq: 'llama-3.3-70b-versatile',
    ollama: 'llama3.2',
};

const SYSTEM_PROMPT = `You are a terminal command translator. Convert natural English into exact shell commands.

STRICT RULES:
1. Return ONLY valid JSON — no markdown, no code fences, no extra text.
2. Use the OS/shell info provided. Generate platform-specific syntax.
3. The "command" field must contain ONLY the raw, executable command. No placeholders, no comments, no alternatives.
4. The "explanation" field must be ONE short sentence — what the command does. No tips, no suggestions, no follow-ups.
5. The "warning" field: set ONLY for destructive commands (rm -rf, DROP TABLE, format, etc.). Otherwise null. Keep it to one sentence max.
6. Do NOT add extra fields, suggestions, alternatives, or conversational filler.
7. If the input IS already a valid command, return it as-is.
8. For ambiguous requests, pick the single most likely command. Never list options.

RESPONSE FORMAT (strict JSON, nothing else):
{
  "command": "exact executable command",
  "explanation": "one-line description",
  "warning": null
}`;


class AIService {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
    }

    /** Get the currently configured provider */
    getProvider() {
        return vscode.workspace.getConfiguration('aiTerminal').get('apiProvider', 'gemini');
    }

    /** Get the stable model for a provider (auto-selected, not user-configurable) */
    getModel(provider) {
        return STABLE_MODELS[provider] || STABLE_MODELS.gemini;
    }

    /** Get the stored API key for a specific provider */
    async getApiKey(provider) {
        const p = provider || this.getProvider();
        const key = await this.context.secrets.get(`aiTerminal.apiKey.${p}`);
        return key || null;
    }

    /** Store API key securely for a specific provider */
    async setApiKey(provider, key) {
        await this.context.secrets.store(`aiTerminal.apiKey.${provider}`, key);
    }

    /** Delete API key for a specific provider */
    async deleteApiKey(provider) {
        await this.context.secrets.delete(`aiTerminal.apiKey.${provider}`);
    }

    /** Check if a provider has an API key configured */
    async hasApiKey(provider) {
        if (provider === 'ollama') return true; // No key needed
        const key = await this.getApiKey(provider);
        return !!key;
    }

    /** Detect the current shell */
    detectShell() {
        const shellSetting = vscode.workspace.getConfiguration('aiTerminal').get('shell', 'auto');
        if (shellSetting !== 'auto') return shellSetting;
        if (process.platform === 'win32') return 'powershell';
        if (process.platform === 'darwin') return 'zsh';
        return 'bash';
    }

    /**
     * Translate natural language to a terminal command.
     * Provider + model are auto-resolved from config.
     */
    async translateToCommand(naturalLanguage, cancellationToken) {
        const provider = this.getProvider();
        const model = this.getModel(provider);
        const shell = this.detectShell();
        const platform = process.platform === 'win32' ? 'Windows'
            : process.platform === 'darwin' ? 'macOS' : 'Linux';

        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd();

        const userMessage = [
            `OS: ${platform}`,
            `Shell: ${shell}`,
            `Working Directory: ${cwd}`,
            ``,
            `Translate this to a terminal command: "${naturalLanguage}"`,
        ].join('\n');

        switch (provider) {
            case 'openai':
                return this._callOpenAI(model, userMessage, cancellationToken);
            case 'gemini':
                return this._callGemini(model, userMessage, cancellationToken);
            case 'anthropic':
                return this._callAnthropic(model, userMessage, cancellationToken);
            case 'groq':
                return this._callGroq(model, userMessage, cancellationToken);
            case 'ollama':
                return this._callOllama(model, userMessage, cancellationToken);
            default:
                throw new Error(`Unknown provider: ${provider}. Go to Settings to choose a valid provider.`);
        }
    }

    // ────────── Provider API Calls ──────────

    async _callOpenAI(model, userMessage, ct) {
        const apiKey = await this.getApiKey('openai');
        if (!apiKey) throw new Error('OpenAI API key not set. Open the sidebar to configure it.');

        const body = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: 'json_object' },
        });

        const resp = await this._httpsRequest({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, body, ct);

        const data = JSON.parse(resp);
        if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
        return this._parseResponse(data.choices?.[0]?.message?.content);
    }

    async _callGemini(model, userMessage, ct) {
        const apiKey = await this.getApiKey('gemini');
        if (!apiKey) throw new Error('Gemini API key not set. Open the sidebar to configure it.');

        const body = JSON.stringify({
            contents: [{
                parts: [{
                    text: `${SYSTEM_PROMPT}\n\n${userMessage}\n\nRespond ONLY with valid JSON.`
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 500,
                responseMimeType: 'application/json',
            },
        });

        const resp = await this._httpsRequest({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, body, ct);

        const data = JSON.parse(resp);
        if (data.error) throw new Error(`Gemini: ${data.error.message}`);
        return this._parseResponse(data.candidates?.[0]?.content?.parts?.[0]?.text);
    }

    async _callAnthropic(model, userMessage, ct) {
        const apiKey = await this.getApiKey('anthropic');
        if (!apiKey) throw new Error('Anthropic API key not set. Open the sidebar to configure it.');

        const body = JSON.stringify({
            model,
            max_tokens: 500,
            system: SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: userMessage + '\n\nRespond ONLY with valid JSON.' }
            ],
        });

        const resp = await this._httpsRequest({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
        }, body, ct);

        const data = JSON.parse(resp);
        if (data.error) throw new Error(`Anthropic: ${data.error.message}`);
        return this._parseResponse(data.content?.[0]?.text);
    }

    async _callGroq(model, userMessage, ct) {
        const apiKey = await this.getApiKey('groq');
        if (!apiKey) throw new Error('Groq API key not set. Open the sidebar to configure it.');

        const body = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage + '\n\nRespond ONLY with valid JSON.' },
            ],
            temperature: 0.1,
            max_tokens: 500,
        });

        const resp = await this._httpsRequest({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, body, ct);

        const data = JSON.parse(resp);
        if (data.error) throw new Error(`Groq: ${data.error.message}`);
        return this._parseResponse(data.choices?.[0]?.message?.content);
    }

    async _callOllama(model, userMessage, ct) {
        const endpoint = vscode.workspace.getConfiguration('aiTerminal')
            .get('ollamaEndpoint', 'http://localhost:11434');
        const url = new URL(endpoint);

        const body = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage + '\n\nRespond ONLY with valid JSON.' },
            ],
            stream: false,
            format: 'json',
        });

        const isHttps = url.protocol === 'https:';
        const requestFn = isHttps ? this._httpsRequest : this._httpRequest;

        const resp = await requestFn.call(this, {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 11434),
            path: '/api/chat',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, body, ct);

        const data = JSON.parse(resp);
        return this._parseResponse(data.message?.content);
    }

    // ────────── Helpers ──────────

    _parseResponse(content) {
        if (!content) throw new Error('Empty response from AI provider');
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
            return {
                command: parsed.command || '',
                explanation: parsed.explanation || '',
                warning: parsed.warning || null,
            };
        } catch {
            const lines = content.trim().split('\n');
            return {
                command: lines[0].replace(/^[`$#>\s]+/, '').trim(),
                explanation: lines.slice(1).join(' ').trim() || 'Generated command',
                warning: null,
            };
        }
    }

    _httpsRequest(options, body, ct) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve(data));
            });
            req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timed out (30s)')); });
            if (ct?.onCancellationRequested) {
                ct.onCancellationRequested(() => { req.destroy(); reject(new Error('Cancelled')); });
            }
            req.write(body);
            req.end();
        });
    }

    _httpRequest(options, body, ct) {
        return new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve(data));
            });
            req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
            req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timed out (120s)')); });
            if (ct?.onCancellationRequested) {
                ct.onCancellationRequested(() => { req.destroy(); reject(new Error('Cancelled')); });
            }
            req.write(body);
            req.end();
        });
    }
}

module.exports = { AIService, STABLE_MODELS };
