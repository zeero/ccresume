import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConversationList } from './components/ConversationList.js';
import { ConversationPreview } from './components/ConversationPreview.js';
import { ConversationPreviewFull } from './components/ConversationPreviewFull.js';
import { CommandEditor } from './components/CommandEditor.js';
import { getPaginatedConversations } from './utils/conversationReader.js';
import { spawn } from 'child_process';
import clipboardy from 'clipboardy';
import { loadConfig } from './utils/configLoader.js';
import { matchesKeyBinding } from './utils/keyBindingHelper.js';
// Layout constants
const ITEMS_PER_PAGE = 30;
const HEADER_HEIGHT = 2; // Title + pagination info
const LIST_MAX_HEIGHT = 9; // Maximum height for conversation list
const LIST_BASE_HEIGHT = 3; // Borders (2) + title (1)
const MAX_VISIBLE_CONVERSATIONS = 4; // Maximum conversations shown per page
const BOTTOM_MARGIN = 1; // Bottom margin to absorb overflow
const SAFETY_MARGIN = 1; // Prevents Ink from clearing terminal when output approaches height limit
const MIN_PREVIEW_HEIGHT = 10; // Minimum height for conversation preview
const DEFAULT_TERMINAL_WIDTH = 80;
const DEFAULT_TERMINAL_HEIGHT = 24;
const EXECUTE_DELAY_MS = 500; // Delay before executing command to show status
const STATUS_MESSAGE_DURATION_MS = 2000; // Duration to show status messages
const App = ({ claudeArgs = [], currentDirOnly = false, hideOptions = [] }) => {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const [conversations, setConversations] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dimensions, setDimensions] = useState({ width: DEFAULT_TERMINAL_WIDTH, height: DEFAULT_TERMINAL_HEIGHT });
    const [statusMessage, setStatusMessage] = useState(null);
    const config = useMemo(() => loadConfig(), []);
    const [showCommandEditor, setShowCommandEditor] = useState(false);
    const [editedArgs, setEditedArgs] = useState(claudeArgs);
    const [showFullView, setShowFullView] = useState(false);
    // Pagination state
    const [currentPage, setCurrentPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [paginating, setPaginating] = useState(false);
    useEffect(() => {
        // Update dimensions on terminal resize
        const updateDimensions = () => {
            setDimensions({
                width: stdout.columns || DEFAULT_TERMINAL_WIDTH,
                height: stdout.rows || DEFAULT_TERMINAL_HEIGHT
            });
        };
        updateDimensions();
        if (stdout) {
            stdout.on('resize', updateDimensions);
            return () => {
                stdout.off('resize', updateDimensions);
            };
        }
        return undefined;
    }, [stdout]);
    const executeClaudeCommand = (conversation, args, statusMsg, actionType) => {
        const commandStr = `${config.command} ${args.join(' ')}`;
        setStatusMessage(statusMsg);
        setTimeout(() => {
            exit();
            // Output helpful information
            if (actionType === 'resume') {
                console.log(`\nResuming conversation: ${conversation.sessionId}`);
            }
            else {
                console.log(`\nStarting new session in: ${conversation.projectPath}`);
            }
            console.log(`Directory: ${conversation.projectPath}`);
            console.log(`Executing: ${commandStr}`);
            console.log('---');
            // Windows-specific reminder
            if (process.platform === 'win32') {
                console.log('💡 Reminder: If input doesn\'t work, press ENTER to activate.');
                console.log('');
            }
            // Spawn claude process
            const claude = spawn(commandStr, {
                stdio: 'inherit',
                cwd: conversation.projectPath,
                shell: true
            });
            claude.on('error', (err) => {
                console.error(`\nFailed to ${actionType} ${actionType === 'resume' ? 'conversation' : 'new session'}:`, err.message);
                console.error('Make sure Claude Code is installed and available in PATH');
                console.error(`Or the project directory might not exist: ${conversation.projectPath}`);
                // For resume action, provide clipboard fallback
                if (actionType === 'resume') {
                    try {
                        clipboardy.writeSync(conversation.sessionId);
                        console.log(`\nSession ID copied to clipboard: ${conversation.sessionId}`);
                        console.log(`Project directory: ${conversation.projectPath}`);
                        console.log(`You can manually run:`);
                        console.log(`  cd "${conversation.projectPath}"`);
                        const argsStr = claudeArgs.length > 0 ? claudeArgs.join(' ') + ' ' : '';
                        console.log(`  ${config.command} ${argsStr}--resume ${conversation.sessionId}`);
                    }
                    catch (clipErr) {
                        console.error('Failed to copy to clipboard:', clipErr instanceof Error ? clipErr.message : String(clipErr));
                    }
                }
                process.exit(1);
            });
            claude.on('close', (code) => {
                process.exit(code || 0);
            });
        }, EXECUTE_DELAY_MS);
    };
    const loadConversations = useCallback(async (isPaginating = false) => {
        try {
            if (isPaginating) {
                setPaginating(true);
                setConversations([]); // Clear current conversations
            }
            else {
                setLoading(true);
            }
            const currentDir = currentDirOnly ? process.cwd() : undefined;
            // Load paginated conversations
            const offset = currentPage * ITEMS_PER_PAGE;
            const { conversations: convs, total } = await getPaginatedConversations({
                limit: ITEMS_PER_PAGE,
                offset,
                currentDirFilter: currentDir
            });
            setConversations(convs);
            setTotalCount(total);
            setLoading(false);
            setPaginating(false);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load conversations');
            setLoading(false);
            setPaginating(false);
        }
    }, [currentPage, currentDirOnly]);
    const prevPageRef = useRef(0);
    useEffect(() => {
        const wasPage = prevPageRef.current;
        const isPaginating = currentPage !== wasPage;
        prevPageRef.current = currentPage;
        void loadConversations(isPaginating);
    }, [currentPage, loadConversations]);
    useInput((input, key) => {
        // Don't process any input when command editor is shown
        if (showCommandEditor)
            return;
        if (matchesKeyBinding(input, key, config.keybindings.quit)) {
            exit();
        }
        // Handle full view toggle first
        if (matchesKeyBinding(input, key, config.keybindings.toggleFullView)) {
            setShowFullView(prev => !prev);
            // Show temporary status message
            setStatusMessage(showFullView ? 'Switched to normal view' : 'Switched to full view');
            setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_DURATION_MS);
            return;
        }
        // In full view, disable all navigation keys except quit and toggle
        if (showFullView) {
            return;
        }
        if (loading || conversations.length === 0)
            return;
        // Calculate pagination values
        const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
        if (matchesKeyBinding(input, key, config.keybindings.selectPrevious)) {
            if (selectedIndex === 0 && currentPage > 0) {
                // Auto-navigate to previous page when at first item
                setCurrentPage(prev => prev - 1);
                setSelectedIndex(ITEMS_PER_PAGE - 1); // Select last item of previous page
            }
            else {
                setSelectedIndex((prev) => Math.max(0, prev - 1));
            }
        }
        if (matchesKeyBinding(input, key, config.keybindings.selectNext)) {
            const maxIndex = conversations.length - 1;
            const canGoNext = totalCount === -1 ? conversations.length === ITEMS_PER_PAGE : currentPage < totalPages - 1;
            if (selectedIndex === maxIndex && canGoNext) {
                // Auto-navigate to next page when at last item
                setCurrentPage(prev => prev + 1);
                setSelectedIndex(0); // Select first item of next page
            }
            else {
                setSelectedIndex((prev) => Math.min(maxIndex, prev + 1));
            }
        }
        // Page navigation with arrow keys and n/p
        if (matchesKeyBinding(input, key, config.keybindings.pageNext)) {
            // For unknown total (-1), allow next if we got full page
            if (totalCount === -1 ? conversations.length === ITEMS_PER_PAGE : currentPage < totalPages - 1) {
                setCurrentPage(prev => prev + 1);
                setSelectedIndex(0); // Reset selection to first item of new page
            }
        }
        if (matchesKeyBinding(input, key, config.keybindings.pagePrevious) && currentPage > 0) {
            setCurrentPage(prev => prev - 1);
            setSelectedIndex(0); // Reset selection to first item of new page
        }
        if (matchesKeyBinding(input, key, config.keybindings.confirm)) {
            const selectedConv = conversations[selectedIndex];
            if (selectedConv) {
                const commandArgs = [...editedArgs, '--resume', selectedConv.sessionId];
                const commandStr = `${config.command} ${commandArgs.join(' ')}`;
                executeClaudeCommand(selectedConv, commandArgs, `Executing: ${commandStr}`, 'resume');
            }
        }
        if (matchesKeyBinding(input, key, config.keybindings.copySessionId)) {
            // Copy session ID to clipboard
            const selectedConv = conversations[selectedIndex];
            if (selectedConv) {
                try {
                    clipboardy.writeSync(selectedConv.sessionId);
                    // Show temporary status message
                    setStatusMessage('✓ Session ID copied to clipboard!');
                    setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_DURATION_MS);
                }
                catch {
                    setStatusMessage('✗ Failed to copy to clipboard');
                    setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_DURATION_MS);
                }
            }
        }
        if (matchesKeyBinding(input, key, config.keybindings.startNewSession)) {
            // Start new session without resuming
            const selectedConv = conversations[selectedIndex];
            if (selectedConv) {
                const commandArgs = [...editedArgs];
                executeClaudeCommand(selectedConv, commandArgs, `Starting new session in: ${selectedConv.projectPath}`, 'start');
            }
        }
        if (matchesKeyBinding(input, key, config.keybindings.openCommandEditor)) {
            setShowCommandEditor(true);
        }
    });
    if (loading) {
        return (React.createElement(Box, { flexDirection: "column", paddingY: 1 },
            React.createElement(Text, { color: "cyan" }, "Loading conversations...")));
    }
    if (error) {
        return (React.createElement(Box, { flexDirection: "column", paddingY: 1 },
            React.createElement(Text, { color: "red" },
                "Error: ",
                error)));
    }
    // Get the selected conversation
    const selectedConversation = conversations[selectedIndex] || null;
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
    // Calculate heights for fixed layout
    const headerHeight = HEADER_HEIGHT;
    const listMaxHeight = LIST_MAX_HEIGHT;
    const visibleConversations = Math.min(MAX_VISIBLE_CONVERSATIONS, conversations.length);
    // List height calculation: 
    // LIST_BASE_HEIGHT includes borders (2) + title (1)
    const needsMoreIndicator = conversations.length > visibleConversations ? 1 : 0;
    const listHeight = Math.min(listMaxHeight, LIST_BASE_HEIGHT + visibleConversations + needsMoreIndicator);
    // Add safety margin to prevent exceeding terminal height
    const safetyMargin = SAFETY_MARGIN;
    const bottomMargin = BOTTOM_MARGIN;
    const totalUsedHeight = headerHeight + listHeight + bottomMargin + safetyMargin;
    const previewHeight = Math.max(MIN_PREVIEW_HEIGHT, dimensions.height - totalUsedHeight);
    if (showCommandEditor) {
        return (React.createElement(CommandEditor, { initialArgs: editedArgs, onComplete: (args) => {
                setEditedArgs(args);
                setShowCommandEditor(false);
            }, onCancel: () => setShowCommandEditor(false) }));
    }
    if (showFullView) {
        return React.createElement(ConversationPreviewFull, { conversation: selectedConversation, statusMessage: statusMessage, hideOptions: hideOptions });
    }
    return (React.createElement(Box, { flexDirection: "column", width: dimensions.width, paddingX: 1, paddingY: 0 },
        React.createElement(Box, { height: headerHeight, flexDirection: "column" },
            React.createElement(Text, { bold: true, color: "cyan" }, "ccresume - Claude Code Conversation Browser"),
            React.createElement(Box, null,
                React.createElement(Text, { dimColor: true }, (() => {
                    const prevKeys = config?.keybindings.pagePrevious.map(k => k === 'left' ? '←' : k).join('/') || '←';
                    const nextKeys = config?.keybindings.pageNext.map(k => k === 'right' ? '→' : k).join('/') || '→';
                    const pageHelp = `Press ${prevKeys}/${nextKeys} for pages`;
                    return totalCount === -1 ? (React.createElement(React.Fragment, null,
                        "Page ",
                        currentPage + 1,
                        " | ",
                        pageHelp)) : (React.createElement(React.Fragment, null,
                        totalCount,
                        " total | Page ",
                        currentPage + 1,
                        "/",
                        totalPages || 1,
                        " | ",
                        pageHelp));
                })()),
                editedArgs.length > 0 && (React.createElement(Text, { color: "yellow" },
                    " | Options: ",
                    editedArgs.join(' '))))),
        React.createElement(Box, { height: listHeight },
            React.createElement(ConversationList, { conversations: conversations, selectedIndex: selectedIndex, maxVisible: visibleConversations, isLoading: paginating })),
        React.createElement(Box, { height: previewHeight },
            React.createElement(ConversationPreview, { conversation: selectedConversation, statusMessage: statusMessage, hideOptions: hideOptions })),
        React.createElement(Box, { height: bottomMargin })));
};
export default App;
