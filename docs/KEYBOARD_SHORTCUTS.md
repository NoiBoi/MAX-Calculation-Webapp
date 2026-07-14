# Implemented Keyboard Shortcuts

Every shortcut has a visible control equivalent. On macOS, browser support may map Control to Command; the current automated coverage targets Chromium on Windows.

| Action | Shortcut | Behavior |
|---|---|---|
| Command menu | `Ctrl+K` | Opens the in-place command menu. |
| Save recipe/revision | `Ctrl+S` / `Cmd+S` | Saves only a current valid calculation; recipe revisions are explicit. |
| Undo | `Ctrl+Z` / `Cmd+Z` | Restores the previous scientific working state. |
| Redo | `Ctrl+Shift+Z`, `Cmd+Shift+Z`, or `Ctrl+Y` | Reapplies an undone scientific edit. |
| New recipe | `Ctrl+Alt+N` / `Cmd+Alt+N` | Starts a new unsaved recipe. |
| Duplicate | `Ctrl+Alt+D` / `Cmd+Alt+D` | Creates an unsaved copy without changing the source. |
| Copy weighing table | `Ctrl+Alt+C` / `Cmd+Alt+C` | Copies current valid results as tab-delimited text. |
| Toggle advanced mode | `Ctrl+Alt+A` | Switches modes without changing recipe state. |
| Focus formula | `Alt+1` | Focuses and selects the target formula. |
| Focus route | `Alt+2` | Focuses the first precursor formula. |
| Focus batch mass | `Alt+3` | Focuses and selects target batch mass. |
| Focus results | `Alt+4` | Focuses the scrolling result-table region. |
| Close temporary UI | `Escape` | Closes the command menu, side panel, and calculation trace. |
| Advance primary fields | `Enter` | Commits the current primary field and focuses the next one. |
| Move backward | `Shift+Enter` | Commits and focuses the previous primary field. |

CSV, JSON, and print remain command-menu actions to avoid browser-reserved shortcuts.
# Comparison and data management

Comparison, layouts, backup, restore, and import use normal Tab/Shift+Tab navigation, native select controls, and Enter/Space activation. No pointer-only resize or hidden shortcut is implemented. Existing workspace shortcuts do not fire while focus is in an editable control.
