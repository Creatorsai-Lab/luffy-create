# AI Agent Guide

The AI Agent is an editor assistant for preparing scene edits as structured commands. It is most useful when you describe a clear change and give enough context, such as the scene number, selected item, size, color, timing, or asset name.

## How It Works

1. Open a project.
2. Select the scene or item you want to edit when the request depends on "this" or "selected".
3. Type a request in the AI Agents sidebar.
4. Review the pending plan.
5. Click **Apply** only when the plan matches your intent.

AI edits are applied as editor commands, not by clicking UI controls. Applied plans are grouped into one undo step, so one Undo can roll back the AI change.

## Best Requests

Be specific about target, action, and values.

Good examples:

```text
Add a 500x500 purple square on scene 2.
```

```text
Set scene 3 background to black.
```

```text
Move the selected item to the right with speed 400 and delay 1.2 seconds.
```

```text
Add title text "Huber Loss" on scene 1 with font size 72 and white color.
```

```text
Set a fade transition on scene 4 with duration 0.8 seconds.
```

## Using Selection

When editing an existing element, select it first and use words like:

```text
Make the selected text larger and white.
```

```text
Apply move animation to this item toward top right.
```

If no element is selected, the AI may not be able to resolve "this" or "selected". In that case, select the item or name the element directly.

## Getting Better Results

- Mention the scene number for scene-specific edits.
- Mention exact sizes, colors, speed, delay, and duration when they matter.
- Use asset names that already exist in the project.
- Review warnings in the pending plan before applying.
- Prefer one focused request at a time for precise edits.
- Use Undo if the applied result is not what you wanted.

## Safety And Limits

The AI plan is validated before Apply. Invalid scene numbers are clamped, unsafe values are normalized, and commands with missing assets or unresolved elements are removed. The AI cannot use assets that are not already in the project, and it should not invent asset IDs.

For large changes such as full storyboard creation, review the full pending plan carefully before applying.
