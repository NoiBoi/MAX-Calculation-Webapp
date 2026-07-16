# Implemented Keyboard Shortcuts

Every shortcut has a visible control equivalent. On macOS, browser support may map Control to Command; the current automated coverage targets Chromium on Windows.

| Action | Shortcut | Behavior |
|---|---|---|
| Command menu | `Ctrl+K` | Opens the in-place command menu. |
| Open Save dialog | `Ctrl+S` / `Cmd+S` | Opens confirmation for a valid calculation; a scientific revision is created only after explicit submit. |
| Undo | `Ctrl+Z` / `Cmd+Z` | Restores the previous scientific working state. |
| Redo | `Ctrl+Shift+Z`, `Cmd+Shift+Z`, or `Ctrl+Y` | Reapplies an undone scientific edit. |
| New recipe | `Ctrl+Alt+N` / `Cmd+Alt+N` | Starts a new unsaved recipe. |
| Duplicate | `Ctrl+Alt+D` / `Cmd+Alt+D` | Creates an unsaved copy without changing the source. |
| Copy weighing table | `Ctrl+Alt+C` / `Cmd+Alt+C` | Copies current valid results as tab-delimited text. |
| Toggle advanced mode | `Ctrl+Alt+A` | Switches modes without changing recipe state. |
| Focus formula | `Alt+1` | Focuses and selects the target formula. |
| Focus route | `Alt+2` | Focuses the first precursor formula. |
| Previous precursor formula | `Alt+ArrowUp` | Moves to and selects the previous enabled formula field; stops at the first row. |
| Next precursor formula | `Alt+ArrowDown` | Moves to and selects the next enabled formula field; stops at the last row. |
| Focus batch mass | `Alt+3` | Focuses and selects target batch mass. |
| Focus results | `Alt+4` | Focuses the scrolling result-table region. |
| Close temporary UI | `Escape` | Closes the Save/Notes modal, command menu, side panel, or calculation trace; dismissible panels return focus to their trigger. |
| Advance primary fields | `Enter` | Commits the current primary field and focuses the next one. |
| Move backward | `Shift+Enter` | Commits and focuses the previous primary field. |

CSV, JSON, and print remain command-menu actions to avoid browser-reserved shortcuts.
# Comparison and data management

Comparison, layouts, backup, restore, import, and recipe notes use normal Tab/Shift+Tab navigation, native controls, and Enter/Space activation. Plain arrow keys inside formula fields remain text-editing keys; route navigation requires Alt. In the Save dialog, Enter submits from ordinary controls but not from the multiline revision-note field. No pointer-only resize or hidden shortcut is implemented. Other workspace shortcuts do not fire while focus is in an editable control.

Settings use native labeled inputs, checkboxes, selects, and explicit `Up`/`Down` column-order buttons. There is no settings-only shortcut and no drag-only operation. Enter on the Save dialog uses the locally configured default post-save action; the split menu remains keyboard accessible and retains all actions.
