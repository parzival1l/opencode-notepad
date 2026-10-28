# opencode-notepad

An OpenCode Desktop plugin that adds a Markdown notepad to the session side panel. The note's top section is a checklist. The coding agent can add to it, so "add this to the list" in chat is enough.

## Parts

- **Server** (`src/index.ts`) owns the note file and serializes every edit. It registers the agent tools and the `notepad` RPC.
- **GUI** (`src/gui.tsx`, built to `dist/gui-experimental.cjs`) adds the **Notepad** side tab, a composer pill with the open-item count, and the **Toggle Notepad** command (`mod+alt+n`).
- **RPC** (`src/rpc.ts`) is the contract between the two parts. The server emits `updated` on every change, including edits made in other apps.

## Note format

The note is one plain Markdown file, `~/Documents/OpenCode/notepad.md` by default. The run of task lines at the very top is the checklist. Everything after the first non-task line is free Markdown.

```markdown
- [ ] Review the citation flow
- [x] Ship the PR

## Notes

Anything you like.
```

## Agent tools

| Tool | What it does |
|------|--------------|
| `notepad.add` | Adds checklist items. Triggered by "add this to the list", "remind me to", and similar. |
| `notepad.check` | Checks or unchecks items by text `query` or by `index`. |
| `notepad.read` | Returns the numbered checklist and the notes. |
| `notepad.append_note` | Appends Markdown to the notes section. |

## Install

1. Run `bun install` and `bun run build`.
2. Add the folder to `plugins` in the global `~/.config/opencode/opencode.jsonc`. OpenCode Desktop loads GUI parts only from the global config.

```jsonc
{
  "plugins": [
    "/Users/nandakumar/Personal/opencode-notepad",
    // Or set another note file:
    // { "package": "/Users/nandakumar/Personal/opencode-notepad", "options": { "path": "~/notes/todo.md" } },
  ],
}
```

3. Open a session, then pick **Notepad** from the side panel's **+** menu, or press `mod+alt+n`.

## Develop

- `bun run dev` rebuilds the GUI on every change. Each rebuild reloads the GUI in every window.
- The server reloads when a file in `src/` changes.
- `bun test` covers the note format and the file store. `bun run typecheck` runs `tsc`.

## Markdown Preview

The toolbar button opens the note in [Markdown Preview](https://github.com/pluk-inc/markdown-preview) through its `md-preview://file/<path>` URL scheme. There you can read it with an outline, or click its checkboxes. The panel picks up those edits. The checklist styles adapt Markdown Preview's task-list rules (MIT): done items are muted, not struck through.

## Limits

- The server runs one plugin instance per project directory. Each instance serializes its own writes. Two instances that write in the same few milliseconds can still lose one edit.
- The GUI API is experimental. This plugin pins `@opencode/plugin@2.2.0`, which matches OpenCode Desktop 2.2.0.
