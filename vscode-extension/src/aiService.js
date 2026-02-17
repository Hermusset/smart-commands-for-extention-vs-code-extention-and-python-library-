const vscode = require('vscode');
const https = require('https');
const http = require('http');

const SYSTEM_PROMPT = `You are an expert terminal command translator. Your job is to convert natural English descriptions into accurate terminal/shell commands.

RULES:
1. Return ONLY the command and a brief explanation. No markdown formatting.
2. Detect the user's operating system and shell from context.
3. Support ALL technologies including but not limited to:
   - Git (git commands, branching, merging, rebasing, stashing)
   - Docker (docker, docker-compose, building, running, networking)
   - Python (pip, conda, virtualenv, running scripts, Django, Flask, FastAPI)
   - Node.js (npm, yarn, pnpm, npx)
   - SQL (mysql, psql, sqlite3)
   - MongoDB (mongosh, mongodump, mongorestore)
   - C/C++ (gcc, g++, make, cmake)
   - Java (javac, java, maven, gradle)
   - Rust (cargo, rustc)
   - Go (go build, go run, go test)
   - Kubernetes (kubectl, helm)
   - Terraform, Ansible
   - Streamlit (streamlit run)
   - AWS CLI, Azure CLI, GCloud
   - File operations (copy, move, delete, find, grep)
   - Network (curl, wget, ping, ssh, scp)
   - System (process management, disk usage, memory)
   - Package managers (apt, brew, choco, winget)
4. If the command could be destructive (rm -rf, DROP TABLE, etc.), add a warning in the explanation.
5. ALWAYS prefer safe, commonly-used command patterns.
6. For ambiguous requests, provide the most likely intended command.

RESPONSE FORMAT (JSON):
{
  "command": "the exact command to run",
  "explanation": "brief explanation of what the command does",
  "warning": "optional warning if the command is destructive"
}`;

class AIService {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
    }

    /**
     * Get the stored API key for the current provider
     */
    async getApiKey(provider) {
        // First try secrets storage
        let key = await this.context.secrets.get(`aiTerminal.apiKey.${provider}`);
        if (key) return key;

        // Fallback to settings (not recommended, but convenient)
        const config = vscode.workspace.getConfiguration('aiTerminal');
        key = config.get('apiKey', '');
        return key || null;
    }

    /**
     * Store API key securely
     */
    async setApiKey(provider, key) {
        await this.context.secrets.store(`aiTerminal.apiKey.${provider}`, key);
    }

    /**
     * Detect the current shell environment
     */
    detectShell() {
        const config = vscode.workspace.getConfiguration('aiTerminal');
        const shellSetting = config.get('shell', 'auto');

        if (shellSetting !== 'auto') return shellSetting;

        const platform = process.platform;
        if (platform === 'win32') return 'powershell';
        if (platform === 'darwin') return 'zsh';
        return 'bash';
    }

    /**
     * Main translation method
     */
    async translateToCommand(naturalLanguage, cancellationToken) {
        const config = vscode.workspace.getConfiguration('aiTerminal');
        const provider = config.get('apiProvider', 'openai');
        const model = config.get('model', 'gpt-4o-mini');
        const shell = this.detectShell();
        const platform = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';

        const userMessage = `OS: ${platform}\nShell: ${shell}\nWorkspace: ${vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || 'unknown'}\n\nTranslate this to a terminal command: "${naturalLanguage}"`;

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
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }

    /**
     * OpenAI API call
     */
    async _callOpenAI(model, userMessage, cancellationToken) {
        const apiKey = await this.getApiKey('openai');
        if (!apiKey) throw new Error('API key not set. Please configure your OpenAI API key in settings.');

        const body = JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: 'json_object' }
        });

        const response = await this._httpsRequest({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, body, cancellationToken);

        const data = JSON.parse(response);
        if (data.error) throw new Error(data.error.message);

        const content = data.choices?.[0]?.message?.content;
        return this._parseResponse(content);
    }

    /**
     * Google Gemini API call
     */
    async _callGemini(model, userMessage, cancellationToken) {
        const apiKey = await this.getApiKey('gemini');
        if (!apiKey) throw new Error('API key not set. Please configure your Gemini API key in settings.');

        const body = JSON.stringify({
            contents: [{
                parts: [{
                    text: `${SYSTEM_PROMPT}\n\n${userMessage}\n\nRespond in JSON format.`
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 500,
                responseMimeType: 'application/json'
            }
        });

        const geminiModel = model || 'gemini-2.0-flash';
        const response = await this._httpsRequest({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, body, cancellationToken);

        const data = JSON.parse(response);
        if (data.error) throw new Error(data.error.message);

        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return this._parseResponse(content);
    }

    /**
     * Anthropic Claude API call
     */
    async _callAnthropic(model, userMessage, cancellationToken) {
        const apiKey = await this.getApiKey('anthropic');
        if (!apiKey) throw new Error('API key not set. Please configure your Anthropic API key in settings.');

        const body = JSON.stringify({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 500,
            system: SYSTEM_PROMPT,
            messages: [
                { role: 'user', content: userMessage + '\n\nRespond in JSON format.' }
            ]
        });

        const response = await this._httpsRequest({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
        }, body, cancellationToken);

        const data = JSON.parse(response);
        if (data.error) throw new Error(data.error.message);

        const content = data.content?.[0]?.text;
        return this._parseResponse(content);
    }

    /**
     * Groq API call (fast inference)
     */
    async _callGroq(model, userMessage, cancellationToken) {
        const apiKey = await this.getApiKey('groq');
        if (!apiKey) throw new Error('API key not set. Please configure your Groq API key in settings.');

        const body = JSON.stringify({
            model: model || 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage + '\n\nRespond in JSON format.' }
            ],
            temperature: 0.1,
            max_tokens: 500,
        });

        const response = await this._httpsRequest({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, body, cancellationToken);

        const data = JSON.parse(response);
        if (data.error) throw new Error(data.error.message);

        const content = data.choices?.[0]?.message?.content;
        return this._parseResponse(content);
    }

    /**
     * Ollama API call (local models)
     */
    async _callOllama(model, userMessage, cancellationToken) {
        const config = vscode.workspace.getConfiguration('aiTerminal');
        const endpoint = config.get('ollamaEndpoint', 'http://localhost:11434');

        const url = new URL(endpoint);
        const body = JSON.stringify({
            model: model || 'llama3.2',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage + '\n\nRespond in JSON format.' }
            ],
            stream: false,
            format: 'json',
        });

        const isHttps = url.protocol === 'https:';
        const requestFn = isHttps ? this._httpsRequest : this._httpRequest;

        const response = await requestFn.call(this, {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 11434),
            path: '/api/chat',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, body, cancellationToken);

        const data = JSON.parse(response);
        const content = data.message?.content;
        return this._parseResponse(content);
    }

    /**
     * Parse AI response
     */
    _parseResponse(content) {
        if (!content) throw new Error('Empty response from AI provider');

        try {
            // Try to extract JSON from the response
            let jsonStr = content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }
            const parsed = JSON.parse(jsonStr);
            return {
                command: parsed.command || '',
                explanation: parsed.explanation || '',
                warning: parsed.warning || null,
            };
        } catch {
            // If JSON parsing fails, try to extract the command directly
            const lines = content.trim().split('\n');
            return {
                command: lines[0].replace(/^[`$#>\s]+/, '').trim(),
                explanation: lines.slice(1).join(' ').trim() || 'Generated command',
                warning: null,
            };
        }
    }

    /**
     * HTTPS request helper
     */
    _httpsRequest(options, body, cancellationToken) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve(data));
            });

            req.on('error', (error) => reject(new Error(`Network error: ${error.message}`)));
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            if (cancellationToken) {
                cancellationToken.onCancellationRequested(() => {
                    req.destroy();
                    reject(new Error('Request cancelled'));
                });
            }

            req.write(body);
            req.end();
        });
    }

    /**
     * HTTP request helper (for Ollama local)
     */
    _httpRequest(options, body, cancellationToken) {
        return new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve(data));
            });

            req.on('error', (error) => reject(new Error(`Network error: ${error.message}`)));
            req.setTimeout(60000, () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            if (cancellationToken) {
                cancellationToken.onCancellationRequested(() => {
                    req.destroy();
                    reject(new Error('Request cancelled'));
                });
            }

            req.write(body);
            req.end();
        });
    }
}

module.exports = { AIService };
