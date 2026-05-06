"""
Configuration management for AI Terminal Assistant.

Stores API keys and settings in a local JSON config file
at ~/.ai-terminal/config.json
"""

import json
import os
from pathlib import Path
from typing import Optional, Dict, Any


CONFIG_DIR = Path.home() / ".ai-terminal"
CONFIG_FILE = CONFIG_DIR / "config.json"
HISTORY_FILE = CONFIG_DIR / "history.json"

DEFAULT_CONFIG = {
    "provider": "ollama",
    "model": "",
    "shell": "auto",
    "safe_mode": True,
    "allow_remote_ollama_endpoint": False,
    "auto_execute": False,
    "ollama_endpoint": "http://localhost:11434",
    "api_keys": {},
}

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "anthropic": "claude-3-5-sonnet-20241022",
    "groq": "llama-3.3-70b-versatile",
    "ollama": "llama3.2",
}

PROVIDER_NAMES = {
    "openai": "OpenAI",
    "gemini": "Google Gemini",
    "anthropic": "Anthropic",
    "groq": "Groq",
    "ollama": "Ollama (Local)",
}


def _ensure_config_dir():
    """Create config directory if it doesn't exist."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def _load_config() -> dict:
    """Load configuration from file."""
    _ensure_config_dir()
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
            # Merge with defaults for any missing keys
            merged = {**DEFAULT_CONFIG, **config}
            return merged
        except (json.JSONDecodeError, IOError):
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()


def _save_config(config: dict):
    """Save configuration to file."""
    _ensure_config_dir()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def get_config() -> dict:
    """
    Get current configuration.

    Returns:
        dict: Current configuration including provider, model, shell, etc.
    """
    return _load_config()


def configure(
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    shell: Optional[str] = None,
    safe_mode: Optional[bool] = None,
    allow_remote_ollama_endpoint: Optional[bool] = None,
    auto_execute: Optional[bool] = None,
    ollama_endpoint: Optional[str] = None,
) -> dict:
    """
    Configure AI Terminal Assistant settings.

    Args:
        provider: AI provider ('openai', 'gemini', 'anthropic', 'groq', 'ollama')
        api_key: API key for the selected provider
        model: Model name to use
        shell: Target shell ('auto', 'powershell', 'cmd', 'bash', 'zsh')
        auto_execute: Whether to auto-execute generated commands
        ollama_endpoint: Custom Ollama API endpoint

    Returns:
        dict: Updated configuration

    Example:
        >>> configure(provider="gemini", api_key="AIza...")
        >>> configure(provider="ollama", model="llama3.2")
    """
    config = _load_config()

    if provider is not None:
        valid_providers = ["openai", "gemini", "anthropic", "groq", "ollama"]
        if provider not in valid_providers:
            raise ValueError(
                f"Invalid provider '{provider}'. Choose from: {', '.join(valid_providers)}"
            )
        config["provider"] = provider

    if api_key is not None:
        target_provider = provider or config["provider"]
        if "api_keys" not in config:
            config["api_keys"] = {}
        config["api_keys"][target_provider] = api_key

    if model is not None:
        config["model"] = model

    if shell is not None:
        valid_shells = ["auto", "powershell", "cmd", "bash", "zsh"]
        if shell not in valid_shells:
            raise ValueError(
                f"Invalid shell '{shell}'. Choose from: {', '.join(valid_shells)}"
            )
        config["shell"] = shell

    if auto_execute is not None:
        config["auto_execute"] = auto_execute

    if safe_mode is not None:
        config["safe_mode"] = bool(safe_mode)

    if allow_remote_ollama_endpoint is not None:
        config["allow_remote_ollama_endpoint"] = bool(allow_remote_ollama_endpoint)

    if ollama_endpoint is not None:
        config["ollama_endpoint"] = ollama_endpoint

    _save_config(config)
    return config


def reset_config():
    """Reset all configuration to defaults."""
    _save_config(DEFAULT_CONFIG.copy())
    return DEFAULT_CONFIG.copy()


def get_api_key(provider: Optional[str] = None) -> Optional[str]:
    """Get the API key for a specific provider."""
    config = _load_config()
    p = provider or config.get("provider", "ollama")
    return config.get("api_keys", {}).get(p)


def get_model(provider: Optional[str] = None) -> str:
    """Get the model for a specific provider."""
    config = _load_config()
    model = config.get("model", "")
    if model:
        return model
    p = provider or config.get("provider", "ollama")
    return DEFAULT_MODELS.get(p, "")


def get_shell() -> str:
    """Detect or return configured shell."""
    config = _load_config()
    shell = config.get("shell", "auto")
    if shell != "auto":
        return shell

    # Auto-detect
    if os.name == "nt":
        return "powershell"
    
    user_shell = os.environ.get("SHELL", "")
    if "zsh" in user_shell:
        return "zsh"
    return "bash"


def get_platform() -> str:
    """Get the current platform name."""
    import platform as _platform
    system = _platform.system()
    if system == "Windows":
        return "Windows"
    elif system == "Darwin":
        return "macOS"
    return "Linux"
