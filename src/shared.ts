// Shared types and utilities used by both the plugin (main.ts) and CLI (cli.ts)

import { nanoid } from 'nanoid';

const ID_LENGTH = 3;

export interface Comment {
    id?: string; // short nanoid (auto-generated on creation)
    filePath: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    selectedText: string;
    selectedTextHash: string;
    comment: string;
    timestamp: number;
    isOrphaned?: boolean;
    commentPath?: string;
    resolved?: boolean;
    resolvedAt?: number | null;
    type?: "selection" | "file";
    parentTimestamp?: number;
    parentId?: string; // nanoid of parent comment
}

export function generateId(existingIds: Set<string>): string {
    let id: string;
    do {
        id = nanoid(ID_LENGTH);
    } while (existingIds.has(id));
    existingIds.add(id);
    return id;
}
