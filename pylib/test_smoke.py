"""Quick test to verify the library works."""
from ai_terminal import translate, translate_and_run, configure, AITerminal
from ai_terminal.config import get_config, get_shell, get_platform
from ai_terminal import history as hist

print("=== Smoke Test ===")
print(f"Platform: {get_platform()}")
print(f"Shell: {get_shell()}")

config = get_config()
print(f"Provider: {config['provider']}")
print(f"Safe mode: {config.get('safe_mode', True)}")
print(f"History entries: {len(hist.get_history())}")

# Test AITerminal class instantiation
t = AITerminal(provider="ollama")
print(f"AITerminal created: provider={t.provider}, model={t.model}")

# Test config
configure(safe_mode=False)
configure(provider="gemini")
config = get_config()
print(f"Config updated: provider={config['provider']}")

# Reset back
configure(provider="ollama")
configure(safe_mode=True)

print("\nAll imports and basic functions work correctly!")
print("Library is ready to use.")
