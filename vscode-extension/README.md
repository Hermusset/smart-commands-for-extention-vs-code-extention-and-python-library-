# AI Terminal Assistant - VS Code Extension

> 🤖 Convert plain English to terminal commands using AI. BYOK (Bring Your Own Key) architecture.

## Features

- **Natural Language → Commands**: Type what you want in plain English, get the exact terminal command
- **50+ Technologies**: Git, Docker, Python, SQL, MongoDB, C/C++, Java, Rust, Go, Kubernetes, Terraform, Streamlit, AWS, and more
- **BYOK Architecture**: Use your own API key from OpenAI, Gemini, Anthropic, Groq, or Ollama (local)
- **Secure Key Storage**: API keys are stored in VS Code's secure secrets storage
- **Smart Shell Detection**: Automatically detects PowerShell, Bash, Zsh, or CMD
- **Command History**: View and re-run previous translations
- **Edit Before Run**: Review, edit, copy, or run generated commands

## Quick Start

1. Install the extension
2. Open the sidebar (look for the ⚡ icon in the activity bar)
3. Go to Settings tab → Select your AI provider → Enter your API key
4. Go to Translate tab → Type your request → Press **Ctrl+Shift+I** or click Translate

## Usage Examples

| English Input | Generated Command |
|---|---|
| "create a new git branch called feature-auth" | `git checkout -b feature-auth` |
| "build and run the docker container" | `docker build -t myapp . && docker run -p 3000:3000 myapp` |
| "install flask and run my app" | `pip install flask && python app.py` |
| "show all running containers" | `docker ps` |
| "connect to postgres and list tables" | `psql -U postgres -c '\\dt'` |
| "compile my c++ program and run it" | `g++ main.cpp -o main && ./main` |
| "run streamlit app" | `streamlit run app.py` |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+I` | Open translation input box |

## Supported Providers

| Provider | Models | Free Tier |
|---|---|---|
| OpenAI | GPT-4o, GPT-4o-mini | ❌ |
| Google Gemini | Gemini 2.0 Flash | ✅ |
| Anthropic | Claude 3.5 Sonnet | ❌ |
| Groq | Llama 3.3 70B | ✅ |
| Ollama | Any local model | ✅ (local) |

## Installation

### From VSIX file
```bash
code --install-extension ai-terminal-assistant-1.0.0.vsix
```

### From source
```bash
cd vscode-extension
npm install
# Press F5 in VS Code to run in development mode
```

## License

MIT
