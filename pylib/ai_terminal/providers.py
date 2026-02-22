"""
AI Provider integrations for AI Terminal Assistant.

Supports: OpenAI, Gemini, Anthropic, Groq, Ollama (local)
"""

import json
import requests
from typing import Optional, Dict, Any
from dataclasses import dataclass


SYSTEM_PROMPT = """You are an expert terminal command translator. Your job is to convert natural English descriptions into accurate terminal/shell commands.

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
   - Package managers (apt, brew, choco, winget, pip)
   - Machine Learning (nvidia-smi, jupyter, wandb, mlflow, huggingface-cli)
   - PyTorch / TensorFlow (training scripts, CUDA device selection, model export)
   - Experiment tracking (wandb, mlflow, tensorboard)
4. If the command could be destructive (rm -rf, DROP TABLE, etc.), add a warning.
5. ALWAYS prefer safe, commonly-used command patterns.
6. For ambiguous requests, provide the most likely intended command.

RESPONSE FORMAT (JSON):
{
  "command": "the exact command to run",
  "explanation": "brief explanation of what the command does",
  "warning": "optional warning if the command is destructive"
}"""


@dataclass
class TranslationResult:
    """Result from an AI translation."""
    command: str
    explanation: str
    warning: Optional[str] = None

    def __str__(self):
        return self.command

    def __repr__(self):
        return f"TranslationResult(command='{self.command}')"


def _parse_response(content: str) -> TranslationResult:
    """Parse AI response into TranslationResult."""
    if not content:
        raise ValueError("Empty response from AI provider")

    try:
        # Try to extract JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            content = json_match.group(0)
        parsed = json.loads(content)
        return TranslationResult(
            command=parsed.get("command", ""),
            explanation=parsed.get("explanation", ""),
            warning=parsed.get("warning"),
        )
    except (json.JSONDecodeError, AttributeError):
        # Fallback: first line is command
        lines = content.strip().split("\n")
        cmd = lines[0].lstrip("`$#> ").rstrip("`")
        return TranslationResult(
            command=cmd,
            explanation=" ".join(lines[1:]).strip() or "Generated command",
        )


def call_openai(
    api_key: str,
    model: str,
    user_message: str,
    timeout: int = 30,
) -> TranslationResult:
    """Call OpenAI API."""
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": model or "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
            "max_tokens": 500,
            "response_format": {"type": "json_object"},
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise RuntimeError(data["error"].get("message", "OpenAI API error"))

    content = data["choices"][0]["message"]["content"]
    return _parse_response(content)


def call_gemini(
    api_key: str,
    model: str,
    user_message: str,
    timeout: int = 30,
) -> TranslationResult:
    """Call Google Gemini API."""
    gemini_model = model or "gemini-2.0-flash"
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}",
        headers={"Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "parts": [
                        {"text": f"{SYSTEM_PROMPT}\n\n{user_message}\n\nRespond in JSON format."}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 500,
                "responseMimeType": "application/json",
            },
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise RuntimeError(data["error"].get("message", "Gemini API error"))

    content = data["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_response(content)


def call_anthropic(
    api_key: str,
    model: str,
    user_message: str,
    timeout: int = 30,
) -> TranslationResult:
    """Call Anthropic Claude API."""
    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": model or "claude-3-5-sonnet-20241022",
            "max_tokens": 500,
            "system": SYSTEM_PROMPT,
            "messages": [
                {"role": "user", "content": user_message + "\n\nRespond in JSON format."}
            ],
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise RuntimeError(data["error"].get("message", "Anthropic API error"))

    content = data["content"][0]["text"]
    return _parse_response(content)


def call_groq(
    api_key: str,
    model: str,
    user_message: str,
    timeout: int = 30,
) -> TranslationResult:
    """Call Groq API (fast inference)."""
    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": model or "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message + "\n\nRespond in JSON format."},
            ],
            "temperature": 0.1,
            "max_tokens": 500,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()

    if "error" in data:
        raise RuntimeError(data["error"].get("message", "Groq API error"))

    content = data["choices"][0]["message"]["content"]
    return _parse_response(content)


def call_ollama(
    endpoint: str,
    model: str,
    user_message: str,
    timeout: int = 120,
) -> TranslationResult:
    """Call Ollama API (local model)."""
    url = f"{endpoint.rstrip('/')}/api/chat"
    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json={
            "model": model or "llama3.2",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message + "\n\nRespond in JSON format."},
            ],
            "stream": False,
            "format": "json",
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()

    content = data.get("message", {}).get("content", "")
    return _parse_response(content)


# Provider dispatch map
PROVIDERS = {
    "openai": call_openai,
    "gemini": call_gemini,
    "anthropic": call_anthropic,
    "groq": call_groq,
}
