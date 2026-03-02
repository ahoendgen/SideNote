# SideNote Supercharged

Supercharged fork of [SideNote](https://github.com/mofukuru/SideNote), an Obsidian plugin for adding comments to notes.

## Architecture

Two source files in `src/`:

- `main.ts` (1490 lines): Plugin class, UI (sidebar view, modals, settings), CodeMirror decorations, file event handlers
- `commentManager.ts` (489 lines): Comment data model, CRUD operations, SHA256 text anchoring, position tracking

## Data Model

Comments stored in `.obsidian/plugins/side-note-supercharged/data.json` as flat array:

```typescript
interface Comment {
  filePath: string;         // vault-relative path
  startLine: number;        // anchor coordinates
  startChar: number;
  endLine: number;
  endChar: number;
  selectedText: string;     // original marked text
  selectedTextHash: string; // SHA256 for robust matching
  comment: string;          // the actual comment content
  timestamp: number;        // creation time, used as unique ID
  isOrphaned?: boolean;     // true when anchor text deleted
  resolved?: boolean;       // resolve/reopen workflow
  resolvedAt?: number;
}
```

Settings are stored alongside comments in the same `data.json` (PluginData = SideNoteSettings + comments array).

## Text Anchoring

3-stage matching when file content changes:

1. Search near original coordinates with hash verification (fast, handles small edits)
2. Search entire file by hash (handles moved text)
3. Mark as orphaned (text deleted)

Minimum text length for reliable anchoring: 10 characters (3 char absolute minimum).

## Build

```bash
npm install        # install dependencies
npm run dev        # watch mode (esbuild, sourcemaps, no minify)
npm run build      # production build (tsc check + esbuild, minified)
```

Output: `main.js` in project root. Copy `main.js`, `manifest.json`, and `styles.css` to vault plugin folder for testing.

## Development Workflow

For testing in André's vault:

```bash
# Build and copy to vault plugin folder
npm run build && cp main.js manifest.json styles.css "/Users/andre/Library/Mobile Documents/iCloud~md~obsidian/Documents/andre/.obsidian/plugins/side-note/"
```

Then reload Obsidian (Cmd+R) to pick up changes.

## Upstream

- **Upstream remote**: `upstream` -> github.com/mofukuru/SideNote
- **Branch**: `supercharged` (based on upstream `main`)
- Periodically merge upstream: `git fetch upstream && git merge upstream/main`

## Key Classes

- `SideNote` (Plugin): Main plugin, manages lifecycle, commands, event handlers
- `SideNoteView` (ItemView): Sidebar/split pane rendering, comment list UI
- `CommentManager`: Stateless-ish data operations on comment array
- `CommentModal` (Modal): Add/edit comment dialog
- `SideNoteSettingTab` (PluginSettingTab): Settings UI

## Conventions

- Plugin ID: `side-note-supercharged`
- Version scheme: `{upstream-version}-sc.{supercharged-increment}` (e.g. `1.0.4-sc.1`)
- Supercharged features go in the "Supercharged Features" section of README
- Keep upstream code structure intact for easy merges
