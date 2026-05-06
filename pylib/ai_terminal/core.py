"""
Core module for AI Terminal Assistant.

Provides the main AITerminal class and convenience functions
for translating natural English to terminal commands.
"""

import os
import subprocess
from typing import Optional
from urllib.parse import urlparse

from ai_terminal.config import (
    get_config,
    get_api_key,
    get_model,
    get_shell,
    get_platform,
    configure,
)
from ai_terminal.providers import (
    TranslationResult,
    call_openai,
    call_gemini,
    call_anthropic,
    call_groq,
    call_ollama,
)
from ai_terminal import history as hist


class AITerminal:
    """
    Main AI Terminal Assistant class.

    Provides methods to translate natural language to terminal commands
    and optionally execute them.

    Example:
        >>> terminal = AITerminal(provider="gemini", api_key="AIza...")
        >>> result = terminal.translate("list all docker containers")
        >>> print(result.command)
        docker ps -a
        >>> result = terminal.translate_and_run("show current git branch")
    """

    def __init__(
        self,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        shell: Optional[str] = None,
        ollama_endpoint: Optional[str] = None,
        save_history: bool = True,
    ):
        """
        Initialize AITerminal.

        Args:
            provider: AI provider (openai, gemini, anthropic, groq, ollama).
                      Defaults to config file setting.
            api_key: API key. Defaults to config file setting.
            model: Model name. Defaults to provider default.
            shell: Target shell. Defaults to auto-detect.
            ollama_endpoint: Ollama API endpoint. Defaults to localhost:11434.
            save_history: Whether to save translations to history.
        """
        config = get_config()

        self.safe_mode = bool(config.get("safe_mode", True))
        self.allow_remote_ollama_endpoint = bool(config.get("allow_remote_ollama_endpoint", False))

        self.provider = provider or config.get("provider", "ollama")
        self.api_key = api_key or get_api_key(self.provider)
        self.model = model or get_model(self.provider)
        self.shell = shell or get_shell()
        self.ollama_endpoint = ollama_endpoint or config.get("ollama_endpoint", "http://localhost:11434")
        self.save_history = save_history
        self.platform = get_platform()

        if self.safe_mode and self.provider != "ollama":
            raise ValueError(
                "Safe mode is enabled (local-only): only provider='ollama' is allowed. "
                "Disable it with: ait config --no-safe-mode"
            )

        if self.provider == "ollama":
            self.ollama_endpoint = self._validated_ollama_endpoint(self.ollama_endpoint)

    def _validated_ollama_endpoint(self, endpoint: str) -> str:
        raw = str(endpoint or "").strip()
        if not raw:
            raise ValueError("Ollama endpoint is empty.")

        if "://" not in raw:
            raw = "http://" + raw

        parsed = urlparse(raw)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Unsupported Ollama endpoint scheme: {parsed.scheme}")
        if not parsed.hostname:
            raise ValueError("Invalid Ollama endpoint.")
        if parsed.username or parsed.password:
            raise ValueError("Ollama endpoint must not include credentials.")

        host = parsed.hostname.lower()
        if not self.allow_remote_ollama_endpoint and host not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError(
                f"Refusing to send prompts to non-local Ollama endpoint ({parsed.hostname}). "
                f"To allow this, run: ait config --allow-remote-ollama-endpoint"
            )

        netloc = parsed.hostname
        if parsed.port:
            netloc += f":{parsed.port}"
        return f"{parsed.scheme}://{netloc}"

    def _build_user_message(self, natural_language: str) -> str:
        """Build the user message with context."""
        cwd = os.getcwd()
        return (
            f"OS: {self.platform}\n"
            f"Shell: {self.shell}\n"
            f"Working Directory: {cwd}\n\n"
            f'Translate this to a terminal command: "{natural_language}"'
        )

    def translate(self, natural_language: str) -> TranslationResult:
        """
        Translate natural English to a terminal command.

        Args:
            natural_language: The English description of what you want to do.

        Returns:
            TranslationResult with command, explanation, and optional warning.

        Raises:
            ValueError: If API key is missing (except for Ollama).
            RuntimeError: If API call fails.

        Example:
            >>> t = AITerminal()
            >>> result = t.translate("create a python virtual environment")
            >>> print(result.command)
            python -m venv venv
            >>> print(result.explanation)
            Creates a new virtual environment in the 'venv' directory
        """
        user_message = self._build_user_message(natural_language)

        if self.provider == "ollama":
            result = call_ollama(self.ollama_endpoint, self.model, user_message)
        else:
            if not self.api_key:
                raise ValueError(
                    f"API key not set for {self.provider}. "
                    f"Run: ait config --provider {self.provider} --api-key YOUR_KEY"
                )

            provider_funcs = {
                "openai": call_openai,
                "gemini": call_gemini,
                "anthropic": call_anthropic,
                "groq": call_groq,
            }

            func = provider_funcs.get(self.provider)
            if not func:
                raise ValueError(f"Unsupported provider: {self.provider}")

            result = func(self.api_key, self.model, user_message)

        # Save to history
        if self.save_history:
            hist.add_entry(
                input_text=natural_language,
                command=result.command,
                explanation=result.explanation,
                provider=self.provider,
                warning=result.warning,
                executed=False,
            )

        return result

    def translate_and_run(
        self,
        natural_language: str,
        confirm: bool = True,
        capture_output: bool = False,
    ) -> dict:
        """
        Translate and execute the command.

        Args:
            natural_language: English description.
            confirm: If True, print command and ask for confirmation before running.
            capture_output: If True, capture and return stdout/stderr.

        Returns:
            dict with 'result' (TranslationResult), 'executed' (bool),
            and optionally 'output', 'returncode'.

        Example:
            >>> t = AITerminal()
            >>> out = t.translate_and_run("show current directory", confirm=False)
            >>> print(out['output'])
        """
        result = self.translate(natural_language)

        if confirm:
            print(f"\n🤖 Command: {result.command}")
            print(f"   ℹ️  {result.explanation}")
            if result.warning:
                print(f"   ⚠️  {result.warning}")

            response = input("\n▶ Execute? [y/N/e(dit)]: ").strip().lower()

            if response == "e":
                edited = input("✏️  Edit command: ").strip()
                if edited:
                    result.command = edited
                else:
                    return {"result": result, "executed": False}
            elif response not in ("y", "yes"):
                return {"result": result, "executed": False}

        # Execute
        try:
            if capture_output:
                proc = subprocess.run(
                    result.command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
                return {
                    "result": result,
                    "executed": True,
                    "output": proc.stdout,
                    "stderr": proc.stderr,
                    "returncode": proc.returncode,
                }
            else:
                returncode = subprocess.call(result.command, shell=True)
                return {
                    "result": result,
                    "executed": True,
                    "returncode": returncode,
                }
        except subprocess.TimeoutExpired:
            return {
                "result": result,
                "executed": True,
                "error": "Command timed out after 300 seconds",
                "returncode": -1,
            }
        except Exception as e:
            return {
                "result": result,
                "executed": True,
                "error": str(e),
                "returncode": -1,
            }


# ============ CONVENIENCE FUNCTIONS ============

_default_terminal: Optional[AITerminal] = None


def _get_terminal() -> AITerminal:
    """Get or create default AITerminal instance."""
    global _default_terminal
    if _default_terminal is None:
        _default_terminal = AITerminal()
    return _default_terminal


def translate(natural_language: str) -> TranslationResult:
    """
    Quick translate function using default config.

    Args:
        natural_language: What you want to do in plain English.

    Returns:
        TranslationResult with command, explanation, warning.

    Example:
        >>> from ai_terminal import translate
        >>> result = translate("list all files sorted by size")
        >>> print(result.command)
        ls -lhS
    """
    return _get_terminal().translate(natural_language)


def translate_and_run(
    natural_language: str,
    confirm: bool = True,
    capture_output: bool = False,
) -> dict:
    """
    Quick translate-and-run function using default config.

    Args:
        natural_language: What you want to do in plain English.
        confirm: Ask before executing.
        capture_output: Capture stdout/stderr.

    Returns:
        dict with result, execution status, and output.

    Example:
        >>> from ai_terminal import translate_and_run
        >>> out = translate_and_run("show disk usage", confirm=False, capture_output=True)
        >>> print(out['output'])
    """
    return _get_terminal().translate_and_run(natural_language, confirm, capture_output)
