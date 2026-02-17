"""
AI Terminal Assistant - Python Library & CLI

Convert natural English to terminal commands using AI.
BYOK (Bring Your Own Key) architecture.

Usage as library:
    from ai_terminal import translate, configure

    configure(provider="gemini", api_key="your-key")
    result = translate("create a new git branch called feature-login")
    print(result.command)

Usage as CLI:
    ait "create a new git branch called feature-login"
    ait --interactive
    ait config --provider gemini --api-key YOUR_KEY
"""

__version__ = "1.0.0"
__author__ = "Shoyeb"

from ai_terminal.core import AITerminal, translate, translate_and_run
from ai_terminal.config import configure, get_config, reset_config

__all__ = [
    "AITerminal",
    "translate",
    "translate_and_run",
    "configure",
    "get_config",
    "reset_config",
]
