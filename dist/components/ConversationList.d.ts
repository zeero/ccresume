import React from 'react';
import type { Conversation } from '../types.js';
interface ConversationListProps {
    conversations: Conversation[];
    selectedIndex: number;
    maxVisible?: number;
    isLoading?: boolean;
}
export declare const ConversationList: React.FC<ConversationListProps>;
export {};
