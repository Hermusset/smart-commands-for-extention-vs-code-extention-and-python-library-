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
3. The "command" field must contain ONLY the raw, executable command. No placeholders, no comments.
4. The "explanation" field must be ONE short sentence — what the command does. No tips, no suggestions, no follow-ups.
5. The "warning" field: set ONLY for destructive commands (rm -rf, DROP TABLE, format, etc.). Otherwise null. One sentence max.
6. If the input IS already a valid command, return it as-is with explanation.
7. Understand the user's INTENT from context — the working directory, OS, and shell. Infer what they actually need.
8. If the intent is UNCLEAR or too vague, return the "command" field with the 2-3 most relevant commands separated by " || " and set "explanation" to briefly describe each. Example: "git status || git log --oneline -5 || git diff".
9. Do NOT add conversational filler, extra fields, or unrelated suggestions.
10. Always prefer the simplest, most common form of a command.

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
     * @param {string} naturalLanguage
     * @param {import('vscode').CancellationToken} [cancellationToken]
     * @param {string} [cwd] - optional override for working directory
     */
    async translateToCommand(naturalLanguage, cancellationToken, cwd) {
        const provider = this.getProvider();
        const model = this.getModel(provider);
        const shell = this.detectShell();
        const platform = process.platform === 'win32' ? 'Windows'
            : process.platform === 'darwin' ? 'macOS' : 'Linux';

        const workDir = cwd || vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd();

        const userMessage = [
            `OS: ${platform}`,
            `Shell: ${shell}`,
            `Working Directory: ${workDir}`,
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

    /**
     * Get 2-3 alternative commands for the same intent.
     * Called when user rejects the first suggestion.
     */
    async translateAlternatives(naturalLanguage, rejectedCommand, cancellationToken, cwd) {
        const provider = this.getProvider();
        const model = this.getModel(provider);
        const shell = this.detectShell();
        const platform = process.platform === 'win32' ? 'Windows'
            : process.platform === 'darwin' ? 'macOS' : 'Linux';

        const workDir = cwd || vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd();

        const userMessage = [
            `OS: ${platform}`,
            `Shell: ${shell}`,
            `Working Directory: ${workDir}`,
            ``,
            `The user asked: "${naturalLanguage}"`,
            `I suggested: "${rejectedCommand}" but they rejected it.`,
            ``,
            `Give me 3 alternative commands that might match their intent.`,
            `Return JSON with field "alternatives" as an array of objects, each with "command" and "explanation".`,
            `Example: {"alternatives": [{"command": "...", "explanation": "..."}, ...]}`,
        ].join('\n');

        // Reuse the same provider calls — the response will be parsed differently
        let result;
        switch (provider) {
            case 'openai':
                result = await this._callOpenAI(model, userMessage, cancellationToken); break;
            case 'gemini':
                result = await this._callGemini(model, userMessage, cancellationToken); break;
            case 'anthropic':
                result = await this._callAnthropic(model, userMessage, cancellationToken); break;
            case 'groq':
                result = await this._callGroq(model, userMessage, cancellationToken); break;
            case 'ollama':
                result = await this._callOllama(model, userMessage, cancellationToken); break;
            default:
                throw new Error(`Unknown provider: ${provider}.`);
        }
        // The _parseResponse returns {command, explanation}, but the raw response
        // may contain alternatives. We handle this by checking.
        // Since the prompt asks for "alternatives" array, we parse it from the command field.
        return this._parseAlternativesResult(result);
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

            // If the AI returned an "alternatives" array, handle it
            if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
                return {
                    command: parsed.alternatives[0]?.command || '',
                    explanation: parsed.alternatives[0]?.explanation || '',
                    warning: null,
                    _raw: parsed,
                };
            }

            return {
                command: parsed.command || '',
                explanation: parsed.explanation || '',
                warning: parsed.warning || null,
                _raw: parsed,
            };
        } catch {
            const lines = content.trim().split('\n');
            return {
                command: lines[0].replace(/^[`$#>\s]+/, '').trim(),
                explanation: lines.slice(1).join(' ').trim() || 'Generated command',
                warning: null,
                _raw: null,
            };
        }
    }

    _parseAlternativesResult(result) {
        // If _raw has an alternatives array, return it directly
        if (result._raw && result._raw.alternatives && Array.isArray(result._raw.alternatives)) {
            return result._raw.alternatives.map(a => ({
                command: a.command || '',
                explanation: a.explanation || '',
            })).filter(a => a.command);
        }
        // Fallback: return the single command as an alternative
        if (result.command) {
            return [{ command: result.command, explanation: result.explanation || '' }];
        }
        return [];
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
