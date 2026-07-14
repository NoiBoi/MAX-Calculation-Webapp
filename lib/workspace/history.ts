import type { WorkspaceRecipeState } from "./adapter";

export interface RecipeCommand {
  readonly id: string;
  readonly type: string;
  readonly groupKey: string;
  readonly before: WorkspaceRecipeState;
  readonly after: WorkspaceRecipeState;
  readonly createdAt: string;
}

export interface RecipeHistoryState {
  readonly undo: readonly RecipeCommand[];
  readonly redo: readonly RecipeCommand[];
}

const clone = (value: WorkspaceRecipeState): WorkspaceRecipeState => structuredClone(value);

export class RecipeCommandHistory {
  private undoStack: RecipeCommand[] = [];
  private redoStack: RecipeCommand[] = [];

  constructor(readonly limit = 150, readonly groupingWindowMs = 500) {
    if (limit < 1) throw new Error("History limit must be positive.");
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get state(): RecipeHistoryState { return { undo: [...this.undoStack], redo: [...this.redoStack] }; }

  record(type: string, groupKey: string, before: WorkspaceRecipeState, after: WorkspaceRecipeState, now = new Date()): void {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const previous = this.undoStack.at(-1);
    const createdAt = now.toISOString();
    if (previous && previous.groupKey === groupKey && now.getTime() - new Date(previous.createdAt).getTime() <= this.groupingWindowMs) {
      this.undoStack[this.undoStack.length - 1] = { ...previous, after: clone(after), createdAt };
    } else {
      this.undoStack.push({ id: `command-${createdAt}-${this.undoStack.length}`, type, groupKey, before: clone(before), after: clone(after), createdAt });
      if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    }
    this.redoStack = [];
  }

  undo(current: WorkspaceRecipeState): WorkspaceRecipeState {
    const command = this.undoStack.pop();
    if (!command) return current;
    this.redoStack.push(command);
    return clone(command.before);
  }

  redo(current: WorkspaceRecipeState): WorkspaceRecipeState {
    const command = this.redoStack.pop();
    if (!command) return current;
    this.undoStack.push(command);
    return clone(command.after);
  }

  clear(): void { this.undoStack = []; this.redoStack = []; }
}
