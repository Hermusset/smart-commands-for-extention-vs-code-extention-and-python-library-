# ⚡ AI Terminal Assistant

> Convert natural English to terminal commands using AI. Available as both a **VS Code Extension** and a **Chrome Extension**.

![BYOK Architecture](https://img.shields.io/badge/Architecture-BYOK-blue)
![Providers](https://img.shields.io/badge/Providers-5+-purple)
![Technologies](https://img.shields.io/badge/Technologies-50+-green)

## 🎯 What Does It Do?

Instead of memorizing hundreds of terminal commands, just describe what you want in plain English:

```
"create a new git branch called feature-login and switch to it"
→ git checkout -b feature-login

"build the docker image and run it on port 3000"
→ docker build -t app . && docker run -p 3000:3000 app

"install streamlit and run my dashboard"
→ pip install streamlit && streamlit run dashboard.py

"connect to mongodb and show all databases"
→ mongosh --eval "show dbs"

"compile main.cpp with g++ and run it"
→ g++ main.cpp -o main && ./main
```

## 🏗️ Architecture: BYOK (Bring Your Own Key)

```
┌──────────────────────────────────┐
│        User Interface            │
│  (VS Code Sidebar / Chrome Popup)│
├──────────────────────────────────┤
│      Natural Language Input      │
│   "create a new react app"       │
├──────────────────────────────────┤
│     AI Provider (BYOK)           │
│  ┌─────────┬──────────┐         │
│  │ OpenAI  │ Gemini   │         │
│  ├─────────┼──────────┤         │
│  │Anthropic│  Groq    │         │
│  ├─────────┴──────────┤         │
│  │  Ollama (Local)    │         │
│  └────────────────────┘         │
├──────────────────────────────────┤
│     Command Output               │
│   "npx create-react-app myapp"   │
│                                  │
│   [▶ Run] [📋 Copy] [✏️ Edit]   │
└──────────────────────────────────┘
```

## 📦 Three Packages

### 1. VS Code Extension (`vscode-extension/`)
- Integrates directly with VS Code's terminal
- Sidebar panel with settings, translate & history tabs
- Keyboard shortcut: `Ctrl+Shift+I`
- **Run**, **Copy**, or **Edit & Run** generated commands
- [View VS Code Extension README →](./vscode-extension/README.md)

### 2. Chrome Extension (`chrome-extension/`)
- Works on any webpage (browser-based IDEs, web terminals)
- Popup UI and floating overlay mode
- Keyboard shortcut: `Ctrl+Shift+I`
- [View Chrome Extension README →](./chrome-extension/README.md)

### 3. Python Library & CLI (`pylib/`)
- **CLI Tool**: `ait "create a git branch"` — instant from any terminal
- **Python API**: `from ai_terminal import translate` — integrate into scripts
- **Interactive Mode**: `ait --interactive` — conversational command generation
- **Rich Terminal UI**: Beautiful colored panels, tables, and spinners
- [View Python Library README →](./pylib/README.md)

```python
# As a library
from ai_terminal import translate, configure
configure(provider="gemini", api_key="your-key")
result = translate("list all docker containers")
print(result.command)  # docker ps -a
```

```bash
# As a CLI
ait "create a react app with TypeScript"
ait --run "show git status"
ait --interactive
```

## 🛠️ Supported Technologies

| Category | Technologies |
|----------|-------------|
| **Version Control** | Git, GitHub CLI, GitLab CLI |
| **Containers** | Docker, Docker Compose, Podman |
| **Cloud** | AWS CLI, Azure CLI, GCloud, Terraform |
| **Languages** | Python, Node.js, Java, C/C++, Rust, Go |
| **Databases** | MySQL, PostgreSQL, SQLite, MongoDB |
| **Orchestration** | Kubernetes, Helm, Ansible |
| **Web Frameworks** | Django, Flask, FastAPI, Streamlit, Next.js |
| **Package Managers** | pip, npm, yarn, cargo, apt, brew, choco |
| **Network** | curl, wget, ssh, scp, ping |
| **System** | File ops, process management, disk usage |

## 🔑 Supported AI Providers

| Provider | Free Tier | Best Model | Speed |
|----------|-----------|------------|-------|
| **OpenAI** | ❌ | gpt-4o-mini | ⚡ Fast |
| **Google Gemini** | ✅ | gemini-2.0-flash | ⚡ Fast |
| **Groq** | ✅ | llama-3.3-70b | ⚡⚡ Very Fast |
| **Anthropic** | ❌ | claude-3-5-sonnet | ⚡ Fast |
| **Ollama** | ✅ Local | any local model | Varies |

## 🚀 Quick Start

### VS Code Extension
```bash
cd vscode-extension
# Press F5 in VS Code to launch Extension Development Host
# Or package with: npx vsce package
```

### Chrome Extension
```bash
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select the chrome-extension/ folder
```

### First-time Setup
1. Open the extension (sidebar in VS Code, toolbar icon in Chrome)
2. Go to **Settings** tab
3. Choose an AI provider
4. Enter your API key
5. Start translating!

## 📁 Project Structure

```
extention/
├── vscode-extension/
│   ├── package.json          # Extension manifest
│   ├── src/
│   │   ├── extension.js      # Main entry point
│   │   ├── aiService.js      # AI provider integrations
│   │   ├── sidebarProvider.js # Webview sidebar UI
│   │   └── historyManager.js # Command history
│   ├── media/                # Icons & assets
│   └── README.md
│
├── chrome-extension/
│   ├── manifest.json         # Chrome manifest v3
│   ├── background.js         # Service worker
│   ├── popup.html            # Popup UI
│   ├── popup.js              # Popup logic
│   ├── content.js            # Page overlay
│   ├── content.css           # Overlay styles
│   ├── icons/                # Extension icons
│   └── README.md
│
├── pylib/
│   ├── pyproject.toml        # Package config & deps
│   ├── ai_terminal/
│   │   ├── __init__.py       # Public API exports
│   │   ├── cli.py            # CLI with Rich terminal UI
│   │   ├── core.py           # AITerminal class
│   │   ├── providers.py      # AI provider integrations
│   │   ├── config.py         # Settings (~/.ai-terminal/)
│   │   └── history.py        # Command history
│   └── README.md
│
└── README.md                 # This file
```

## 🔒 Security

- API keys are stored in **VS Code's SecretStorage** (VS Code) or **Chrome's local storage** (Chrome)
- Keys are **never sent** to any server except the selected AI provider
- All API calls go **directly** from your machine to the provider
- No telemetry, no analytics, no data collection

## 📄 License

MIT License - Use freely for personal and commercial projects.
