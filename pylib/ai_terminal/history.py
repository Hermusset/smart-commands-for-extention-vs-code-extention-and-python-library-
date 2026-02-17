"""
Command history management for AI Terminal Assistant.

Stores translation history in ~/.ai-terminal/history.json
"""

import json
from datetime import datetime
from typing import List, Optional, Dict
from ai_terminal.config import HISTORY_FILE, _ensure_config_dir


MAX_HISTORY = 200


def _load_history() -> List[dict]:
    """Load history from file."""
    _ensure_config_dir()
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def _save_history(history: List[dict]):
    """Save history to file."""
    _ensure_config_dir()
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, default=str)


def add_entry(
    input_text: str,
    command: str,
    explanation: str,
    provider: str,
    warning: Optional[str] = None,
    executed: bool = False,
):
    """
    Add a new entry to command history.

    Args:
        input_text: Original natural language input
        command: Generated terminal command
        explanation: Explanation of the command
        provider: AI provider used
        warning: Optional warning message
        executed: Whether the command was actually executed
    """
    history = _load_history()
    history.insert(0, {
        "input": input_text,
        "command": command,
        "explanation": explanation,
        "provider": provider,
        "warning": warning,
        "executed": executed,
        "timestamp": datetime.now().isoformat(),
    })

    if len(history) > MAX_HISTORY:
        history = history[:MAX_HISTORY]

    _save_history(history)


def get_history(count: Optional[int] = None) -> List[dict]:
    """
    Get command history.

    Args:
        count: Number of recent entries to return (None = all)

    Returns:
        List of history entries, newest first
    """
    history = _load_history()
    if count is not None:
        return history[:count]
    return history


def clear_history():
    """Clear all command history."""
    _save_history([])


def search_history(query: str) -> List[dict]:
    """
    Search history by input text or command.

    Args:
        query: Search term

    Returns:
        Matching history entries
    """
    history = _load_history()
    query_lower = query.lower()
    return [
        entry for entry in history
        if query_lower in entry.get("input", "").lower()
        or query_lower in entry.get("command", "").lower()
    ]
