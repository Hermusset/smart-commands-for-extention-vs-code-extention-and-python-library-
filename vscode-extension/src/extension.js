const vscode = require('vscode');
const { AIService } = require('./aiService');
const { SidebarProvider } = require('./sidebarProvider');
const { HistoryManager } = require('./historyManager');

/** @type {AIService} */
let aiService;
/** @type {HistoryManager} */
let historyManager;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('AI Terminal Assistant is now active!');

    historyManager = new HistoryManager(context);
    aiService = new AIService(context);

    // Register the sidebar webview
    const sidebarProvider = new SidebarProvider(context, aiService, historyManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'aiTerminal.settingsView',
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Main command: Translate English to terminal command
    const translateCmd = vscode.commands.registerCommand(
        'aiTerminal.translateCommand',
        async () => {
            const input = await vscode.window.showInputBox({
                prompt: '🤖 Describe what you want to do in plain English',
                placeHolder: 'e.g., "create a new git branch called feature-login"',
                ignoreFocusOut: true,
            });

            if (!input) return;

            await translateAndExecute(input, context);
        }
    );

    // Open settings panel
    const openSettingsCmd = vscode.commands.registerCommand(
        'aiTerminal.openSettings',
        () => {
            vscode.commands.executeCommand('workbench.view.extension.aiTerminalSidebar');
        }
    );

    // Show history
    const showHistoryCmd = vscode.commands.registerCommand(
        'aiTerminal.showHistory',
        async () => {
            const history = historyManager.getHistory();
            if (history.length === 0) {
                vscode.window.showInformationMessage('No command history yet.');
                return;
            }

            const items = history.map(entry => ({
                label: `$(terminal) ${entry.command}`,
                description: entry.input,
                detail: `${entry.timestamp} | ${entry.provider}`,
                entry
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a command to run again',
                matchOnDescription: true,
            });

            if (selected) {
                await runInTerminal(selected.entry.command);
            }
        }
    );

    context.subscriptions.push(translateCmd, openSettingsCmd, showHistoryCmd);

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(hubot) AI Terminal';
    statusBarItem.tooltip = 'Click to translate English to commands (Ctrl+Shift+I)';
    statusBarItem.command = 'aiTerminal.translateCommand';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Check if API key is configured
    checkApiKeySetup(context);
}

/**
 * Translate natural language to command and optionally execute
 */
async function translateAndExecute(input, context) {
    const config = vscode.workspace.getConfiguration('aiTerminal');
    const autoExecute = config.get('autoExecute', false);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: '🤖 AI Terminal: Translating...',
            cancellable: true,
        },
        async (progress, token) => {
            try {
                progress.report({ message: 'Analyzing your request...' });

                const result = await aiService.translateToCommand(input, token);

                if (token.isCancellationRequested) return;

                if (!result || !result.command) {
                    vscode.window.showWarningMessage(
                        'Could not generate a command. Try rephrasing your request.'
                    );
                    return;
                }

                // Save to history
                historyManager.addEntry({
                    input,
                    command: result.command,
                    explanation: result.explanation,
                    provider: config.get('apiProvider', 'openai'),
                    timestamp: new Date().toLocaleString(),
                });

                if (autoExecute) {
                    vscode.window.showInformationMessage(
                        `🤖 Running: ${result.command}`
                    );
                    await runInTerminal(result.command);
                } else {
                    // Show command with options
                    const action = await vscode.window.showInformationMessage(
                        `🤖 Command: ${result.command}`,
                        { modal: false, detail: result.explanation },
                        'Run',
                        'Copy',
                        'Edit & Run'
                    );

                    if (action === 'Run') {
                        await runInTerminal(result.command);
                    } else if (action === 'Copy') {
                        await vscode.env.clipboard.writeText(result.command);
                        vscode.window.showInformationMessage('Command copied to clipboard!');
                    } else if (action === 'Edit & Run') {
                        const edited = await vscode.window.showInputBox({
                            prompt: 'Edit the command before running',
                            value: result.command,
                            ignoreFocusOut: true,
                        });
                        if (edited) {
                            await runInTerminal(edited);
                        }
                    }
                }
            } catch (error) {
                if (error.message.includes('API key')) {
                    const action = await vscode.window.showErrorMessage(
                        `🔑 API Key Error: ${error.message}`,
                        'Open Settings'
                    );
                    if (action === 'Open Settings') {
                        vscode.commands.executeCommand('aiTerminal.openSettings');
                    }
                } else {
                    vscode.window.showErrorMessage(
                        `AI Terminal Error: ${error.message}`
                    );
                }
            }
        }
    );
}

/**
 * Run a command in the active terminal
 */
async function runInTerminal(command) {
    let terminal = vscode.window.activeTerminal;
    if (!terminal) {
        terminal = vscode.window.createTerminal('AI Terminal');
    }
    terminal.show();
    terminal.sendText(command);
}

/**
 * Check if API key is set up and prompt user if not
 */
async function checkApiKeySetup(context) {
    const config = vscode.workspace.getConfiguration('aiTerminal');
    const provider = config.get('apiProvider', 'openai');

    const key = await context.secrets.get(`aiTerminal.apiKey.${provider}`);
    if (!key) {
        const action = await vscode.window.showInformationMessage(
            '🤖 Welcome to AI Terminal Assistant! Set up your API key to get started.',
            'Set Up Now',
            'Later'
        );
        if (action === 'Set Up Now') {
            vscode.commands.executeCommand('aiTerminal.openSettings');
        }
    }
}

function deactivate() {
    console.log('AI Terminal Assistant deactivated.');
}

module.exports = {
    activate,
    deactivate,
};
