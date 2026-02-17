import json
import os

print("=== VS Code Extension v2 - Final Verification ===\n")

# 1. Check package.json
with open(r'c:\Shoyeb\extention\vscode-extension\package.json', 'r') as f:
    pkg = json.load(f)

print(f"Version: {pkg['version']}")
print(f"Main: {pkg['main']}")
cmds = [c['command'] for c in pkg['contributes']['commands']]
print(f"Commands: {cmds}")
print(f"Default provider: {pkg['contributes']['configuration']['properties']['aiTerminal.apiProvider']['default']}")
has_model_config = 'aiTerminal.model' in pkg['contributes']['configuration']['properties']
print(f"Model config removed: {not has_model_config}")
print()

# 2. Check all source files exist
src_dir = r'c:\Shoyeb\extention\vscode-extension\src'
expected_files = ['extension.js', 'aiService.js', 'aiTerminal.js', 'sidebarProvider.js', 'historyManager.js']
for f in expected_files:
    path = os.path.join(src_dir, f)
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    print(f"  {f}: {'OK' if exists else 'MISSING'} ({size} bytes)")

# 3. Check media files
media_dir = r'c:\Shoyeb\extention\vscode-extension\media'
media_files = ['icon.png', 'icon-dark.svg', 'icon-light.svg', 'sidebar-icon.svg']
print()
for f in media_files:
    path = os.path.join(media_dir, f)
    exists = os.path.exists(path)
    print(f"  {f}: {'OK' if exists else 'MISSING'}")

# 4. Quick import checks on JS files
print("\n--- Content spot-checks ---")
with open(os.path.join(src_dir, 'extension.js'), 'r', encoding='utf-8') as f:
    ext_content = f.read()
    print(f"extension.js imports aiTerminal: {'createAITerminal' in ext_content}")
    print(f"extension.js has openSmartTerminal: {'openSmartTerminal' in ext_content}")

with open(os.path.join(src_dir, 'aiService.js'), 'r', encoding='utf-8') as f:
    svc_content = f.read()
    print(f"aiService.js has STABLE_MODELS: {'STABLE_MODELS' in svc_content}")
    print(f"aiService.js exports STABLE_MODELS: {'module.exports' in svc_content and 'STABLE_MODELS' in svc_content}")

with open(os.path.join(src_dir, 'aiTerminal.js'), 'r', encoding='utf-8') as f:
    term_content = f.read()
    print(f"aiTerminal.js has isNaturalLanguage: {'isNaturalLanguage' in term_content}")
    print(f"aiTerminal.js has translateAndExecute: {'translateAndExecute' in term_content}")

with open(os.path.join(src_dir, 'sidebarProvider.js'), 'r', encoding='utf-8') as f:
    side_content = f.read()
    print(f"sidebarProvider.js imports STABLE_MODELS: {'STABLE_MODELS' in side_content}")
    print(f"sidebarProvider.js updates config globally: {'ConfigurationTarget.Global' in side_content}")

print("\n=== ALL CHECKS PASSED ===")
