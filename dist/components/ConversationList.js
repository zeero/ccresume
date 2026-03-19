import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { format } from 'date-fns';
import { generateConversationSummary, formatProjectPath } from '../utils/conversationUtils.js';
import { getStringDisplayLength } from '../utils/stringUtils.js';
import { strictTruncateByWidth } from '../utils/strictTruncate.js';
export const ConversationList = ({ conversations, selectedIndex, maxVisible = 3, isLoading = false }) => {
    const { stdout } = useStdout();
    const terminalWidth = stdout?.columns || 80;
    // Calculate visible range with bounds checking
    const safeSelectedIndex = Math.max(0, Math.min(selectedIndex, conversations.length - 1));
    // Calculate scroll window
    let startIndex = 0;
    let endIndex = conversations.length;
    if (conversations.length > maxVisible) {
        const halfWindow = Math.floor(maxVisible / 2);
        startIndex = Math.max(0, safeSelectedIndex - halfWindow);
        endIndex = Math.min(conversations.length, startIndex + maxVisible);
        // Adjust if we're at the end
        if (endIndex === conversations.length) {
            startIndex = Math.max(0, endIndex - maxVisible);
        }
    }
    const visibleConversations = conversations.slice(startIndex, endIndex);
    const hasMoreBelow = endIndex < conversations.length;
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "single", borderColor: "cyan", paddingX: 1, width: "100%", overflow: "hidden" },
        React.createElement(Text, { bold: true, color: "cyan" }, isLoading ? 'Loading conversations...' : `Select a conversation${conversations.length > 0 ? ` (${conversations.length} shown)` : ''}:`),
        isLoading ? (React.createElement(Box, { flexDirection: "column", height: maxVisible })) : conversations.length === 0 ? (React.createElement(Text, { color: "gray" }, "No conversations found")) : (visibleConversations.map((conv, visibleIndex) => {
            const actualIndex = startIndex + visibleIndex;
            const isSelected = actualIndex === safeSelectedIndex;
            const summary = generateConversationSummary(conv);
            const projectPath = formatProjectPath(conv.projectPath);
            // Calculate the fixed part length
            const selector = isSelected ? '▶ ' : '  ';
            const dateStr = format(conv.endTime, 'MMM dd HH:mm');
            const fixedPart = `${selector}${dateStr} | ${projectPath}`;
            const fixedPartLength = getStringDisplayLength(fixedPart);
            // Calculate available space for summary (with separator)
            // Add extra buffer to prevent overflow: borders(2) + padding(2) + selector(2) + safety(10) = 16
            const separator = ' | ';
            const totalMargin = 16;
            const availableSpace = Math.max(20, terminalWidth - fixedPartLength - separator.length - totalMargin);
            const truncatedSummary = strictTruncateByWidth(summary, availableSpace);
            // Combine everything into one line
            const fullLine = truncatedSummary
                ? `${fixedPart}${separator}${truncatedSummary}`
                : fixedPart;
            // Final safety check: ensure the entire line fits
            const maxLineWidth = terminalWidth - totalMargin;
            const safeLine = strictTruncateByWidth(fullLine, maxLineWidth);
            return (React.createElement(Box, { key: conv.sessionId, width: "100%", overflow: "hidden" },
                React.createElement(Text, { color: isSelected ? 'black' : 'white', backgroundColor: isSelected ? 'cyan' : undefined, bold: isSelected }, safeLine)));
        })),
        hasMoreBelow && (React.createElement(Box, { width: "100%" },
            React.createElement(Text, { color: "cyan" },
                "\u2193 ",
                conversations.length - endIndex,
                " more on this page...")))));
};
