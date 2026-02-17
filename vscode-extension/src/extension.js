const vscode = require('vscode');
const { AIService } = require('./aiService');
const { SidebarProvider } = require('./sidebarProvider');
const { HistoryManager } = require('./historyManager');
const { createAITerminal } = require('./aiTerminal');

/** @type {AIService} */
let aiService;
/** @type {HistoryManager} */
let historyManager;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('AI Terminal Assistant v2 activated!');

    historyManager = new HistoryManager(context);
    aiService = new AIService(context);

    // ── Sidebar Webview (Setup Panel) ──
    const sidebarProvider = new SidebarProvider(context, aiService, historyManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'aiTerminal.settingsView',
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // ── Command: Open Smart Terminal ──
    const openTerminalCmd = vscode.commands.registerCommand(
        'aiTerminal.openSmartTerminal',
        () => {
            createAITerminal(aiService, historyManager);
        }
    );

    // ── Command: Open Settings ──
    const openSettingsCmd = vscode.commands.registerCommand(
        'aiTerminal.openSettings',
        () => {
            vscode.commands.executeCommand('workbench.view.extension.aiTerminalSidebar');
        }
    );

    context.subscriptions.push(openTerminalCmd, openSettingsCmd);

    // ── Status Bar ──
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right, 100
    );
    statusBar.text = '$(zap) AI Terminal';
    statusBar.tooltip = 'Open AI Terminal (Ctrl+Shift+I)';
    statusBar.command = 'aiTerminal.openSmartTerminal';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // ── First-time setup nudge ──
    checkSetup(context);
}

async function checkSetup(context) {
    const provider = aiService.getProvider();
    const hasKey = await aiService.hasApiKey(provider);

    if (!hasKey) {
        const action = await vscode.window.showInformationMessage(
            'AI Terminal: Set up your API key to get started!',
            'Open Setup',
            'Later'
        );
        if (action === 'Open Setup') {
            vscode.commands.executeCommand('aiTerminal.openSettings');
        }
    }
}

function deactivate() {
    console.log('AI Terminal Assistant deactivated.');
}

module.exports = { activate, deactivate };
