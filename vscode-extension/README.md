# ⚡ AI Terminal Assistant - VS Code Extension

> **Type plain English in the terminal → get real commands → auto-execute.**

## What's New in v2.0

- **Smart Terminal**: Custom AI-powered terminal — type naturally, commands auto-translate and execute
- **Auto Model Selection**: No model config needed, most stable model auto-selected per provider
- **Smart Detection**: Knows the difference between English and real commands — real commands pass through directly
- **Simplified Setup**: Just pick a provider, paste your API key, done

## Quick Start

1. Install the extension
2. Click the ⚡ icon in the Activity Bar
3. Select your AI provider (Gemini, OpenAI, Groq, etc.)
4. Paste your API key and click **Save**
5. Press `Ctrl+Shift+I` to open the **AI Terminal**
6. Start typing in plain English!

## How It Works

The AI Terminal is a custom shell that understands both:

**Natural Language** (auto-translated + executed):
```
> create a new git branch called feature-auth
  ✓ git checkout -b feature-auth
    Creates and switches to a new branch

> build docker image and run on port 3000
  ✓ docker build -t app . && docker run -p 3000:3000 app
```

**Real Commands** (executed directly):
```
> git status
> docker ps -a
> npm install
```

The terminal auto-detects which is which — no special syntax needed.

## Features

- **⚡ Smart Terminal**: Type English, get commands, auto-execute
- **🔑 BYOK**: Bring your own API key — works with 5 providers
- **🎯 Auto Model**: Best stable model auto-selected per provider
- **🔍 Smart Detection**: NL vs command detection with heuristics
- **📜 History**: Built-in `history` command shows past translations
- **🖥️ Cross-Platform**: Windows (PowerShell/CMD), macOS, Linux

## Supported Providers

| Provider | Free Tier | Model (Auto-Selected) |
|----------|-----------|----------------------|
| **Google Gemini** | ✅ Free | gemini-2.5-flash |
| **Groq** | ✅ Free | llama-3.3-70b-versatile |
| **OpenAI** | ❌ Paid | gpt-4o-mini |
| **Anthropic** | ❌ Paid | claude-3-5-sonnet |
| **Ollama** | ✅ Local | llama3.2 (no key needed) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+I` | Open AI Terminal |

## Built-in Terminal Commands

| Command | Action |
|---------|--------|
| `help` | Show usage guide |
| `history` | Show translation history |
| `clear` | Clear screen |
| `exit` | Close terminal |
| `Ctrl+C` | Cancel current operation |

## Supported Technologies

Git, Docker, Python, Node.js, Java, C/C++, Rust, Go, SQL, MongoDB, Kubernetes, Helm, Terraform, Ansible, Streamlit, Django, Flask, FastAPI, AWS CLI, Azure CLI, GCloud, curl, wget, ssh, file operations, package managers, and 50+ more.

## Development

```bash
# Open vscode-extension/ folder in VS Code
# Press F5 to launch Extension Development Host
```

## License

MIT
vsce package
npm install -g @vscode/vsce