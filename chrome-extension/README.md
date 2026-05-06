# AI Terminal Assistant - Chrome Extension

> 🤖 Convert plain English to terminal commands using AI. Works with any browser-based IDE or terminal.

## Features

- **Natural Language → Commands**: Type in English, get precise terminal commands
- **Popup UI**: Click the extension icon for a full translation interface
- **Overlay Mode**: Press `Ctrl+Shift+I` on any page for a quick floating input
- **50+ Technologies Supported**: Git, Docker, Python, SQL, MongoDB, and more
- **Local-only (Ollama)**: Sends requests only to your local Ollama server (`http://localhost:11434` by default)
- **Command History**: View and copy previous translations

## Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder
5. The extension icon will appear in your toolbar

### Setup

1. Click the extension icon in the toolbar
2. Go to **Settings** tab
3. Ensure Ollama is running locally (default: `http://localhost:11434`)
5. Go to **Translate** tab and start typing!

## Usage

### Popup Mode
- Click the extension icon in the toolbar
- Type your request in plain English
- Click **Translate to Command** or press `Ctrl+Enter`
- Click **Copy** to copy the generated command

### Overlay Mode (on any page)
- Press `Ctrl+Shift+I` on any webpage
- Type your request and press `Enter`
- Copy the generated command

## Supported Providers

| Provider | Free Tier | Speed |
|----------|-----------|-------|
| Ollama (Local) | ✅ Free | Varies |

## Key Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+I` | Open overlay on any page |
| `Ctrl+Enter` | Translate (in popup/overlay) |

## License

MIT
