// AI Terminal Assistant - Background Service Worker

const SYSTEM_PROMPT = `You are an expert terminal command translator. Your job is to convert natural English descriptions into accurate terminal/shell commands.

RULES:
1. Return ONLY the command and a brief explanation. No markdown formatting.
2. Support ALL technologies including but not limited to:
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
3. If the command could be destructive, add a warning.
4. ALWAYS prefer safe, commonly-used command patterns.

RESPONSE FORMAT (JSON):
{
  "command": "the exact command to run",
  "explanation": "brief explanation of what the command does",
  "warning": "optional warning if the command is destructive"
}`;

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'translate') {
        handleTranslation(request.input, request.settings)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
    if (command === 'translate-command') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'showOverlay' });
            }
        });
    }
});

async function handleTranslation(input, settings) {
    const { provider, apiKey, model } = settings;

    const userMessage = `Shell: ${settings.shell || 'bash'}\n\nTranslate this to a terminal command: "${input}"`;

    switch (provider) {
        case 'openai':
            return await callOpenAI(apiKey, model || 'gpt-4o-mini', userMessage);
        case 'gemini':
            return await callGemini(apiKey, model || 'gemini-2.0-flash', userMessage);
        case 'anthropic':
            return await callAnthropic(apiKey, model || 'claude-3-5-sonnet-20241022', userMessage);
        case 'groq':
            return await callGroq(apiKey, model || 'llama-3.3-70b-versatile', userMessage);
        case 'ollama':
            return await callOllama(settings.ollamaEndpoint || 'http://localhost:11434', model || 'llama3.2', userMessage);
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

async function callOpenAI(apiKey, model, userMessage) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: 'json_object' },
        }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return parseResponse(data.choices?.[0]?.message?.content);
}

async function callGemini(apiKey, model, userMessage) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}\n\nRespond in JSON format.` }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 500, responseMimeType: 'application/json' },
            }),
        }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return parseResponse(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function callAnthropic(apiKey, model, userMessage) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 500,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage + '\n\nRespond in JSON format.' }],
        }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return parseResponse(data.content?.[0]?.text);
}

async function callGroq(apiKey, model, userMessage) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage + '\n\nRespond in JSON format.' }
            ],
            temperature: 0.1,
            max_tokens: 500,
        }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return parseResponse(data.choices?.[0]?.message?.content);
}

async function callOllama(endpoint, model, userMessage) {
    const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage + '\n\nRespond in JSON format.' }
            ],
            stream: false,
            format: 'json',
        }),
    });

    const data = await response.json();
    return parseResponse(data.message?.content);
}

function parseResponse(content) {
    if (!content) throw new Error('Empty response from AI');

    try {
        let jsonStr = content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
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
