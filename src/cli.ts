// SideNote Supercharged CLI
// Interact with Obsidian SideNote comments from the command line.
// Designed for AI agents and automation scripts.

import * as fs from "fs";
import * as path from "path";
import * as nodeCrypto from "crypto";
import { Comment, generateId } from "./shared";

const PLUGIN_FOLDER = "side-note";
const COMMENTS_FILE = "comments.jsonl";
const VERSION = "1.0.0";

// --- Types ---

interface CommentOutput {
  id: string;
  parentId?: string;
  filePath: string;
  comment: string;
  type?: string;
  resolved?: boolean;
  selectedText?: string;
  createdAt: string;
  replies?: CommentOutput[];
}

interface ParsedArgs {
  [key: string]: string | boolean | undefined;
}

// --- Help texts ---

const MAIN_HELP = `
Usage:   sidenote <command> [options]
Version: ${VERSION}

Description:

  CLI for SideNote Supercharged — read, write, and manage
  Obsidian vault comments stored in JSONL format.
  Designed for AI agent integration.

Options:

  -h, --help       Show this help.
  -V, --version    Show the version number.
  --vault <path>   Path to the Obsidian vault root (required).
  --pretty         Human-readable output (default: JSON).

Commands:

  list        List and filter comments (grouped with replies).
  add         Add a new comment to a file.
  reply       Reply to an existing comment.
  edit        Edit a comment's text.
  resolve     Resolve a comment and its replies.
  unresolve   Unresolve a comment and its replies.
  delete      Delete a comment and its replies.

Run "sidenote <command> --help" for command-specific options.
`.trim();

const CMD_HELP: Record<string, string> = {
  list: `
Usage:   sidenote list [options]

Description:

  List comments, optionally filtered by file or status.
  By default, comments are grouped with their replies.

Options:

  --vault <path>       Path to the Obsidian vault root (required).
  --file <path>        Filter by vault-relative file path.
  --resolved           Show only resolved comments.
  --unresolved         Show only unresolved comments.
  --include-replies    Flat list instead of grouped threads.
  --pretty             Human-readable output.

Examples:

  sidenote list --vault ~/my-vault
  sidenote list --vault ~/my-vault --file "notes/todo.md"
  sidenote list --vault ~/my-vault --unresolved --pretty
`.trim(),

  add: `
Usage:   sidenote add --file <path> --comment <text> [options]

Description:

  Add a new comment to a file. Defaults to a file-level comment.
  For selection comments, provide anchor coordinates and selected text.

Options:

  --vault <path>           Path to the Obsidian vault root (required).
  --file <path>            Vault-relative file path (required).
  --comment <text>         Comment text (required).
  --type <file|selection>  Comment type (default: file).
  --start-line <n>         Start line (for selection comments).
  --start-char <n>         Start character (for selection comments).
  --end-line <n>           End line (for selection comments).
  --end-char <n>           End character (for selection comments).
  --selected-text <text>   Selected text (for selection comments).
  --pretty                 Human-readable output.

Examples:

  sidenote add --vault ~/my-vault --file "notes/todo.md" --comment "Needs review"
  sidenote add --vault ~/my-vault --file "notes/todo.md" --type selection \\
    --comment "Rephrase this" --selected-text "some text in the note" \\
    --start-line 5 --start-char 0 --end-line 5 --end-char 22
`.trim(),

  reply: `
Usage:   sidenote reply --id <id> --comment <text>

Description:

  Reply to an existing comment. Replies are always attached to the
  root comment (flat hierarchy, max 1 level deep, like Confluence).

Options:

  --vault <path>       Path to the Obsidian vault root (required).
  --id <id>            ID of the parent comment (required).
  --comment <text>     Reply text (required).
  --pretty             Human-readable output.

Examples:

  sidenote reply --vault ~/my-vault --id mmarc5t1 --comment "Good point, fixed."
`.trim(),

  edit: `
Usage:   sidenote edit --id <id> --comment <text>

Description:

  Edit the text of an existing comment.

Options:

  --vault <path>       Path to the Obsidian vault root (required).
  --id <id>            ID of the comment to edit (required).
  --comment <text>     New comment text (required).
  --pretty             Human-readable output.

Examples:

  sidenote edit --vault ~/my-vault --id mmarc5t1 --comment "Updated comment"
`.trim(),

  resolve: `
Usage:   sidenote resolve --id <id>

Description:

  Mark a comment as resolved. Cascades to all replies.

Options:

  --vault <path>       Path to the Obsidian vault root (required).
  --id <id>            ID of the comment (required).
  --pretty             Human-readable output.

Examples:

  sidenote resolve --vault ~/my-vault --id mmarc5t1
`.trim(),

  unresolve: `
Usage:   sidenote unresolve --id <id>

Description:

  Mark a resolved comment as unresolved again. Cascades to all replies.

Options:

  --vault <path>       Path to the Obsidian vault root (required).
  --id <id>            ID of the comment (required).
  --pretty             Human-readable output.

Examples:

  sidenote unresolve --vault ~/my-vault --id mmarc5t1
`.trim(),

  delete: `
Usage:   sidenote delete --id <id>

Description:

  Delete a comment permanently. Cascades to all replies.

Options:

  --vault <path>       Path to the Obsidian vault root (required).
  --id <id>            ID of the comment (required).
  --pretty             Human-readable output.

Examples:

  sidenote delete --vault ~/my-vault --id mmarc5t1
`.trim(),
};

// --- Helpers ---

function getCommentsPath(vaultPath: string): string {
  return path.join(vaultPath, ".obsidian", "plugins", PLUGIN_FOLDER, COMMENTS_FILE);
}

function loadComments(vaultPath: string): Comment[] {
  const filePath = getCommentsPath(vaultPath);
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  const comments: Comment[] = content.split("\n").map((line) => JSON.parse(line));

  // Backfill missing IDs
  const existingIds = new Set(comments.map(c => c.id).filter((id): id is string => !!id));
  let needsSave = false;
  for (const c of comments) {
    if (!c.id) {
      c.id = generateId(existingIds);
      needsSave = true;
    }
  }
  if (needsSave) {
    // Backfill parentId (needs all IDs set first)
    for (const c of comments) {
      if (c.parentTimestamp && !c.parentId) {
        const parent = comments.find(p => p.timestamp === c.parentTimestamp);
        if (parent?.id) c.parentId = parent.id;
      }
    }
    const lines = comments.map((c) => JSON.stringify(c));
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  }

  return comments;
}

function saveComments(vaultPath: string, comments: Comment[]): void {
  const filePath = getCommentsPath(vaultPath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const lines = comments.map((c) => JSON.stringify(c));
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

function sha256(text: string): string {
  return nodeCrypto.createHash("sha256").update(text).digest("hex");
}

function toOutput(c: Comment): CommentOutput {
  const out: CommentOutput = {
    id: c.id!,
    filePath: c.filePath,
    comment: c.comment,
    type: c.type || "selection",
    createdAt: new Date(c.timestamp).toISOString(),
  };
  if (c.parentId) out.parentId = c.parentId;
  if (c.resolved) out.resolved = true;
  if (c.selectedText) out.selectedText = c.selectedText;
  return out;
}

function toGroupedOutput(c: Comment, replies: Comment[]): CommentOutput {
  const out = toOutput(c);
  if (replies.length > 0) {
    out.replies = replies.map((r) => toOutput(r));
  }
  return out;
}

function parseArgs(argv: string[]): { command: string | null; args: ParsedArgs } {
  const args: ParsedArgs = {};
  let command: string | null = null;
  let i = 2;

  const booleanFlags = new Set(["json", "pretty", "resolved", "unresolved", "include-replies", "help", "version"]);

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      i++;
    } else if (arg === "-V" || arg === "--version") {
      args.version = true;
      i++;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (booleanFlags.has(key)) {
        args[key] = true;
        i++;
      } else {
        args[key] = argv[i + 1];
        i += 2;
      }
    } else if (!command) {
      command = arg;
      i++;
    } else {
      i++;
    }
  }
  return { command, args };
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function printOutput(data: unknown, pretty: boolean): void {
  if (pretty) {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log("No comments found.");
        return;
      }
      for (const item of data) {
        printCommentPretty(item as CommentOutput);
      }
    } else {
      console.log((data as { message?: string }).message || JSON.stringify(data, null, 2));
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

function printCommentPretty(c: CommentOutput, indent = ""): void {
  const resolved = c.resolved ? " [RESOLVED]" : "";
  const type = c.type === "file" ? "[FILE]" : "[SEL]";
  console.log(`${indent}${type}${resolved} ${c.filePath}  ${c.id}`);
  console.log(`${indent}  ${c.comment}`);
  if (c.selectedText) {
    const excerpt = c.selectedText.length > 60 ? c.selectedText.slice(0, 60) + "..." : c.selectedText;
    console.log(`${indent}  Selected: "${excerpt}"`);
  }
  if (c.replies && c.replies.length > 0) {
    for (const reply of c.replies) {
      printCommentPretty(reply, indent + "  ↳ ");
    }
  }
  if (!indent) console.log();
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function findByIdOrFail(comments: Comment[], id: string): Comment {
  const c = comments.find((c) => c.id === id);
  if (!c) fail(`Comment with id "${id}" not found.`);
  return c;
}

// --- Commands ---

function cmdList(vaultPath: string, args: ParsedArgs): void {
  let comments = loadComments(vaultPath);

  if (args.file) {
    comments = comments.filter((c) => c.filePath === args.file);
  }
  if (args.resolved) {
    comments = comments.filter((c) => c.resolved);
  } else if (args.unresolved) {
    comments = comments.filter((c) => !c.resolved);
  }

  if (args["include-replies"]) {
    printOutput(comments.map(toOutput), !!args.pretty);
    return;
  }

  const roots = comments.filter((c) => !c.parentId && !c.parentTimestamp);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    const pid = c.parentId;
    if (pid) {
      const arr = repliesByParent.get(pid) || [];
      arr.push(c);
      repliesByParent.set(pid, arr);
    }
  }

  const grouped = roots.map((root) =>
    toGroupedOutput(root, (repliesByParent.get(root.id!) || []).sort((a, b) => a.timestamp - b.timestamp))
  );

  printOutput(grouped, !!args.pretty);
}

function cmdAdd(vaultPath: string, args: ParsedArgs): void {
  if (!args.file) fail("--file is required. Run 'sidenote add --help' for usage.");
  if (!args.comment) fail("--comment is required. Run 'sidenote add --help' for usage.");

  const type = (args.type as "file" | "selection") || "file";
  const comments = loadComments(vaultPath);
  const existingIds = new Set(comments.map(c => c.id).filter((id): id is string => !!id));

  const newComment: Comment = {
    id: generateId(existingIds),
    filePath: args.file as string,
    startLine: parseInt(args["start-line"] as string) || 0,
    startChar: parseInt(args["start-char"] as string) || 0,
    endLine: parseInt(args["end-line"] as string) || 0,
    endChar: parseInt(args["end-char"] as string) || 0,
    selectedText: (args["selected-text"] as string) || "",
    selectedTextHash: args["selected-text"] ? sha256(args["selected-text"] as string) : "",
    comment: args.comment as string,
    timestamp: Date.now(),
    isOrphaned: false,
    type: type,
  };

  comments.push(newComment);
  saveComments(vaultPath, comments);
  const out = toOutput(newComment);
  printOutput({ message: `Comment added to "${args.file}" (id: ${out.id})`, ...out }, !!args.pretty);
}

function cmdReply(vaultPath: string, args: ParsedArgs): void {
  if (!args.id) fail("--id is required. Run 'sidenote reply --help' for usage.");
  if (!args.comment) fail("--comment is required. Run 'sidenote reply --help' for usage.");

  const comments = loadComments(vaultPath);
  const parent = findByIdOrFail(comments, args.id as string);
  const existingIds = new Set(comments.map(c => c.id).filter((id): id is string => !!id));

  // Always reply to root (flat hierarchy)
  const rootId = parent.parentId || parent.id;
  const root = comments.find((c) => c.id === rootId) || parent;

  const reply: Comment = {
    id: generateId(existingIds),
    filePath: root.filePath,
    startLine: root.startLine,
    startChar: root.startChar,
    endLine: root.endLine,
    endChar: root.endChar,
    selectedText: root.selectedText,
    selectedTextHash: root.selectedTextHash,
    comment: args.comment as string,
    timestamp: Date.now(),
    isOrphaned: false,
    type: root.type,
    parentTimestamp: root.timestamp,
    parentId: root.id,
  };

  comments.push(reply);
  saveComments(vaultPath, comments);
  const out = toOutput(reply);
  printOutput({ message: `Reply to comment ${root.id} in "${root.filePath}" added (id: ${out.id})`, ...out }, !!args.pretty);
}

function cmdEdit(vaultPath: string, args: ParsedArgs): void {
  if (!args.id) fail("--id is required. Run 'sidenote edit --help' for usage.");
  if (!args.comment) fail("--comment is required. Run 'sidenote edit --help' for usage.");

  const comments = loadComments(vaultPath);
  const comment = findByIdOrFail(comments, args.id as string);

  comment.comment = args.comment as string;
  saveComments(vaultPath, comments);
  const out = toOutput(comment);
  printOutput({ message: `Comment ${out.id} in "${comment.filePath}" updated`, ...out }, !!args.pretty);
}

function cmdResolve(vaultPath: string, args: ParsedArgs): void {
  if (!args.id) fail("--id is required. Run 'sidenote resolve --help' for usage.");

  const comments = loadComments(vaultPath);
  const target = findByIdOrFail(comments, args.id as string);
  const id = target.id!;

  const now = Date.now();
  for (const c of comments) {
    if (c.id === id || c.parentId === id) {
      c.resolved = true;
      c.resolvedAt = now;
    }
  }

  saveComments(vaultPath, comments);
  printOutput({ message: `Comment ${id} in "${target.filePath}" resolved`, id }, !!args.pretty);
}

function cmdUnresolve(vaultPath: string, args: ParsedArgs): void {
  if (!args.id) fail("--id is required. Run 'sidenote unresolve --help' for usage.");

  const comments = loadComments(vaultPath);
  const target = findByIdOrFail(comments, args.id as string);
  const id = target.id!;

  for (const c of comments) {
    if (c.id === id || c.parentId === id) {
      c.resolved = false;
      c.resolvedAt = null;
    }
  }

  saveComments(vaultPath, comments);
  printOutput({ message: `Comment ${id} in "${target.filePath}" unresolved`, id }, !!args.pretty);
}

function cmdDelete(vaultPath: string, args: ParsedArgs): void {
  if (!args.id) fail("--id is required. Run 'sidenote delete --help' for usage.");

  let comments = loadComments(vaultPath);
  const target = findByIdOrFail(comments, args.id as string);
  const id = target.id!;

  comments = comments.filter((c) => c.id !== id && c.parentId !== id);

  saveComments(vaultPath, comments);
  printOutput({ message: `Comment ${id} in "${target.filePath}" deleted`, id }, !!args.pretty);
}

// --- Main ---

function main(): void {
  const { command, args } = parseArgs(process.argv);

  if (args.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (!command || args.help) {
    if (command && CMD_HELP[command]) {
      console.log(CMD_HELP[command]);
    } else {
      console.log(MAIN_HELP);
    }
    process.exit(0);
  }

  if (!CMD_HELP[command]) {
    fail(`Unknown command: "${command}". Run "sidenote --help" for available commands.`);
  }

  if (!args.vault) {
    fail("--vault <path> is required. Provide the path to your Obsidian vault.");
  }

  const vaultPath = path.resolve(args.vault as string);
  if (!fs.existsSync(vaultPath)) {
    fail(`Vault path does not exist: ${vaultPath}`);
  }

  const handlers: Record<string, (v: string, a: ParsedArgs) => void> = {
    list: cmdList, add: cmdAdd, reply: cmdReply, edit: cmdEdit,
    resolve: cmdResolve, unresolve: cmdUnresolve, delete: cmdDelete,
  };
  handlers[command](vaultPath, args);
}

main();
