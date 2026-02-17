"""
CLI entry point for AI Terminal Assistant.

Usage:
    ait "create a new git branch called feature-login"
    ait --interactive
    ait config --provider gemini --api-key YOUR_KEY
    ait history
    ait history --clear
"""

import argparse
import sys
import os
from typing import Optional

# Fix Windows console encoding for Unicode/emoji output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.prompt import Prompt, Confirm
    from rich.text import Text
    from rich.markup import escape
    from rich import box

    HAS_RICH = True
except ImportError:
    HAS_RICH = False

from ai_terminal.core import AITerminal, TranslationResult
from ai_terminal.config import (
    configure,
    get_config,
    reset_config,
    DEFAULT_MODELS,
    PROVIDER_NAMES,
)
from ai_terminal import history as hist


if HAS_RICH:
    console = Console()
else:
    console = None


# ============ DISPLAY HELPERS ============

def print_banner():
    """Print the startup banner."""
    if HAS_RICH:
        banner = Text()
        banner.append("⚡ AI Terminal Assistant\n", style="bold cyan")
        banner.append("   Natural English → Terminal Commands\n", style="dim")
        banner.append("   BYOK Architecture", style="dim italic")
        console.print(Panel(banner, border_style="blue", padding=(0, 2)))
    else:
        print("=" * 45)
        print("  ⚡ AI Terminal Assistant")
        print("  Natural English → Terminal Commands")
        print("=" * 45)


def print_result(result: TranslationResult, input_text: str = ""):
    """Print a translation result beautifully."""
    if HAS_RICH:
        # Command panel
        cmd_text = Text(f"$ {result.command}", style="bold cyan")
        console.print(Panel(
            cmd_text,
            title="[bold green]✅ Generated Command[/]",
            border_style="green",
            padding=(0, 2),
        ))

        # Explanation
        console.print(f"  [dim]ℹ️  {escape(result.explanation)}[/]")

        # Warning
        if result.warning:
            console.print(f"  [bold yellow]⚠️  {escape(result.warning)}[/]")
    else:
        print(f"\n✅ Command: {result.command}")
        print(f"   ℹ️  {result.explanation}")
        if result.warning:
            print(f"   ⚠️  {result.warning}")


def print_error(message: str):
    """Print an error message."""
    if HAS_RICH:
        console.print(f"[bold red]❌ Error:[/] {escape(message)}")
    else:
        print(f"❌ Error: {message}", file=sys.stderr)


def print_success(message: str):
    """Print a success message."""
    if HAS_RICH:
        console.print(f"[bold green]✅ {escape(message)}[/]")
    else:
        print(f"✅ {message}")


def print_info(message: str):
    """Print an info message."""
    if HAS_RICH:
        console.print(f"[dim]ℹ️  {escape(message)}[/]")
    else:
        print(f"ℹ️  {message}")


# ============ COMMANDS ============

def cmd_translate(args):
    """Handle single translation."""
    query = " ".join(args.query)
    if not query:
        print_error("Please provide a query. Usage: ait \"your command description\"")
        return 1

    config = get_config()
    terminal = AITerminal()

    if HAS_RICH:
        with console.status("[bold blue]Translating...", spinner="dots"):
            try:
                result = terminal.translate(query)
            except Exception as e:
                print_error(str(e))
                return 1
    else:
        print("🔄 Translating...")
        try:
            result = terminal.translate(query)
        except Exception as e:
            print_error(str(e))
            return 1

    print_result(result, query)

    # Ask what to do
    if args.run:
        # Auto-run flag
        print_info(f"Running: {result.command}")
        os.system(result.command)
        return 0

    if args.copy:
        # Copy to clipboard
        try:
            import subprocess
            if sys.platform == "win32":
                subprocess.run(
                    "clip", input=result.command.encode(), check=True
                )
            elif sys.platform == "darwin":
                subprocess.run(
                    ["pbcopy"], input=result.command.encode(), check=True
                )
            else:
                subprocess.run(
                    ["xclip", "-selection", "clipboard"],
                    input=result.command.encode(), check=True,
                )
            print_success("Command copied to clipboard!")
        except Exception:
            print(f"\n📋 Copy this: {result.command}")
        return 0

    # Interactive choice
    print()
    if HAS_RICH:
        choice = Prompt.ask(
            "[bold]What next?[/]",
            choices=["run", "copy", "edit", "skip"],
            default="skip",
        )
    else:
        choice = input("▶ [r]un / [c]opy / [e]dit / [s]kip? ").strip().lower()
        if choice in ("r", "run"):
            choice = "run"
        elif choice in ("c", "copy"):
            choice = "copy"
        elif choice in ("e", "edit"):
            choice = "edit"
        else:
            choice = "skip"

    if choice == "run":
        print()
        os.system(result.command)
    elif choice == "copy":
        try:
            import subprocess
            if sys.platform == "win32":
                subprocess.run("clip", input=result.command.encode(), check=True)
            elif sys.platform == "darwin":
                subprocess.run(["pbcopy"], input=result.command.encode(), check=True)
            else:
                subprocess.run(
                    ["xclip", "-selection", "clipboard"],
                    input=result.command.encode(), check=True,
                )
            print_success("Copied to clipboard!")
        except Exception:
            print(f"\n📋 {result.command}")
    elif choice == "edit":
        if HAS_RICH:
            edited = Prompt.ask("✏️  Edit command", default=result.command)
        else:
            edited = input(f"✏️  Edit command [{result.command}]: ").strip()
            if not edited:
                edited = result.command
        print()
        os.system(edited)

    return 0


def cmd_interactive(args):
    """Run in interactive mode."""
    print_banner()

    config = get_config()
    provider = config.get("provider", "openai")
    print_info(f"Provider: {PROVIDER_NAMES.get(provider, provider)}")
    print_info("Type 'exit' or 'quit' to leave. Press Ctrl+C to cancel.\n")

    terminal = AITerminal()

    while True:
        try:
            if HAS_RICH:
                query = Prompt.ask("[bold cyan]🤖 What do you want to do?[/]")
            else:
                query = input("🤖 What do you want to do? > ").strip()

            if not query:
                continue

            if query.lower() in ("exit", "quit", "q"):
                print_info("Goodbye! 👋")
                break

            if HAS_RICH:
                with console.status("[bold blue]Translating...", spinner="dots"):
                    result = terminal.translate(query)
            else:
                print("🔄 Translating...")
                result = terminal.translate(query)

            print_result(result, query)

            # Quick action
            if HAS_RICH:
                choice = Prompt.ask(
                    "\n[bold]Action[/]",
                    choices=["run", "copy", "skip"],
                    default="skip",
                )
            else:
                choice = input("\n▶ [r]un / [c]opy / [s]kip? ").strip().lower()
                if choice in ("r", "run"):
                    choice = "run"
                elif choice in ("c", "copy"):
                    choice = "copy"
                else:
                    choice = "skip"

            if choice == "run":
                print()
                os.system(result.command)

            print()

        except KeyboardInterrupt:
            print("\n")
            print_info("Goodbye! 👋")
            break
        except Exception as e:
            print_error(str(e))
            print()

    return 0


def cmd_config(args):
    """Handle configuration."""
    if args.show:
        config = get_config()
        if HAS_RICH:
            table = Table(
                title="⚙️  Configuration",
                box=box.ROUNDED,
                border_style="blue",
            )
            table.add_column("Setting", style="cyan bold")
            table.add_column("Value", style="white")

            provider = config.get("provider", "openai")
            table.add_row("Provider", PROVIDER_NAMES.get(provider, provider))
            table.add_row(
                "Model",
                config.get("model") or DEFAULT_MODELS.get(provider, "default"),
            )
            table.add_row("Shell", config.get("shell", "auto"))
            table.add_row(
                "Auto Execute",
                "✅ Yes" if config.get("auto_execute") else "❌ No",
            )
            table.add_row(
                "Ollama Endpoint",
                config.get("ollama_endpoint", "http://localhost:11434"),
            )

            # API keys status
            api_keys = config.get("api_keys", {})
            for p in ["openai", "gemini", "anthropic", "groq"]:
                has_key = bool(api_keys.get(p))
                status = "[green]✅ Set[/]" if has_key else "[red]❌ Not set[/]"
                table.add_row(f"{PROVIDER_NAMES[p]} Key", status)

            console.print(table)
        else:
            print("\n⚙️  Configuration:")
            print(f"  Provider: {config.get('provider')}")
            print(f"  Model: {config.get('model') or 'default'}")
            print(f"  Shell: {config.get('shell')}")
            print(f"  Auto Execute: {config.get('auto_execute')}")
            api_keys = config.get("api_keys", {})
            for p in ["openai", "gemini", "anthropic", "groq"]:
                print(f"  {p} key: {'✅ Set' if api_keys.get(p) else '❌ Not set'}")
        return 0

    if args.reset:
        reset_config()
        print_success("Configuration reset to defaults!")
        return 0

    # Apply changes
    changes = {}
    if args.provider:
        changes["provider"] = args.provider
    if args.api_key:
        changes["api_key"] = args.api_key
    if args.model:
        changes["model"] = args.model
    if args.shell:
        changes["shell"] = args.shell
    if args.ollama_endpoint:
        changes["ollama_endpoint"] = args.ollama_endpoint
    if args.auto_execute is not None:
        changes["auto_execute"] = args.auto_execute

    if not changes:
        print_info("No changes specified. Use --show to view current config.")
        print_info("Usage: ait config --provider gemini --api-key YOUR_KEY")
        return 0

    try:
        configure(**changes)
        print_success("Configuration updated!")
        if "api_key" in changes:
            print_success(f"API key saved for {changes.get('provider', get_config()['provider'])}")
    except ValueError as e:
        print_error(str(e))
        return 1

    return 0


def cmd_history(args):
    """Handle history commands."""
    if args.clear:
        hist.clear_history()
        print_success("History cleared!")
        return 0

    if args.search:
        entries = hist.search_history(args.search)
    else:
        entries = hist.get_history(count=args.limit or 20)

    if not entries:
        print_info("No history entries found.")
        return 0

    if HAS_RICH:
        table = Table(
            title="📜 Command History",
            box=box.ROUNDED,
            border_style="blue",
            show_lines=True,
        )
        table.add_column("#", style="dim", width=3)
        table.add_column("Input", style="white", max_width=30)
        table.add_column("Command", style="cyan bold", max_width=40)
        table.add_column("Provider", style="magenta", width=10)
        table.add_column("Time", style="dim", width=20)

        for i, entry in enumerate(entries, 1):
            ts = entry.get("timestamp", "")
            if "T" in ts:
                ts = ts.split("T")[0] + " " + ts.split("T")[1][:5]
            table.add_row(
                str(i),
                entry.get("input", ""),
                entry.get("command", ""),
                entry.get("provider", ""),
                ts,
            )

        console.print(table)
    else:
        print("\n📜 Command History:")
        for i, entry in enumerate(entries, 1):
            print(f"\n  {i}. 💬 {entry.get('input', '')}")
            print(f"     $ {entry.get('command', '')}")
            print(f"     [{entry.get('provider', '')}] {entry.get('timestamp', '')}")

    return 0


# ============ MAIN ============

def create_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="ait",
        description="⚡ AI Terminal Assistant - Convert English to terminal commands",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ait "create a git branch called feature-auth"
  ait "build and run docker container on port 3000"
  ait "install flask and run my app"
  ait --interactive
  ait --run "show all docker containers"
  ait config --provider gemini --api-key AIza...
  ait config --show
  ait history
  ait history --search "git"
  ait history --clear
        """,
    )

    parser.add_argument(
        "query",
        nargs="*",
        help="Natural English description of the command you want",
    )
    parser.add_argument(
        "-i", "--interactive",
        action="store_true",
        help="Run in interactive mode",
    )
    parser.add_argument(
        "-r", "--run",
        action="store_true",
        help="Automatically run the generated command",
    )
    parser.add_argument(
        "-c", "--copy",
        action="store_true",
        help="Copy the generated command to clipboard",
    )
    parser.add_argument(
        "-v", "--version",
        action="version",
        version="%(prog)s 1.0.0",
    )

    subparsers = parser.add_subparsers(dest="subcommand")

    # Config subcommand
    config_parser = subparsers.add_parser("config", help="Configure settings")
    config_parser.add_argument("--provider", choices=["openai", "gemini", "anthropic", "groq", "ollama"])
    config_parser.add_argument("--api-key", dest="api_key", help="Set API key for current provider")
    config_parser.add_argument("--model", help="Set model name")
    config_parser.add_argument("--shell", choices=["auto", "powershell", "cmd", "bash", "zsh"])
    config_parser.add_argument("--ollama-endpoint", dest="ollama_endpoint")
    config_parser.add_argument("--auto-execute", dest="auto_execute", type=bool)
    config_parser.add_argument("--show", action="store_true", help="Show current config")
    config_parser.add_argument("--reset", action="store_true", help="Reset to defaults")

    # History subcommand
    history_parser = subparsers.add_parser("history", help="View command history")
    history_parser.add_argument("--clear", action="store_true", help="Clear history")
    history_parser.add_argument("--search", help="Search history")
    history_parser.add_argument("--limit", type=int, default=20, help="Number of entries")

    return parser


def main():
    """Main CLI entry point."""
    parser = create_parser()
    args = parser.parse_args()

    if args.subcommand == "config":
        return sys.exit(cmd_config(args))

    if args.subcommand == "history":
        return sys.exit(cmd_history(args))

    if args.interactive:
        return sys.exit(cmd_interactive(args))

    if args.query:
        return sys.exit(cmd_translate(args))

    # No args - show help
    parser.print_help()
    return sys.exit(0)


if __name__ == "__main__":
    main()
