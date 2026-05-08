# Theme Token Guide

This document defines which theme tokens should be used for each UI role.

## Core Principle

- Do not hardcode colors for surfaces, borders, text, hover states, or scrollbars.
- Prefer existing tokens from `theme.ts`.
- If a new token is needed, add it to `theme.ts` first instead of introducing an ad-hoc color.

## Token Roles

### Surface Tokens

- `background`
  - Default app/page background.
  - Use for large layout surfaces and neutral page areas.
- `editor-background`
  - Main reading surface.
  - Use for chat body, markdown content containers, tool result bodies, code-adjacent surfaces.
- `input-background`
  - Interactive input surface.
  - Use for text inputs, dropdown triggers, editable controls, compact panels that behave like inputs.
- `command-background`
  - Command/toolbar-specific surface.
  - Use for command-center-like UI, prompt controls, compact toolbars.

### Text Tokens

- `foreground`
  - Primary readable text.
  - Use for headings, labels, important body text, icons in normal state.
- `editor-foreground`
  - Reading text on editor-like surfaces.
  - Use inside markdown/code reading surfaces when the distinction matters.
- `description`
  - Secondary supporting text.
  - Use for helper text, subtitles, metadata, non-primary labels.
- `description-muted`
  - De-emphasized text.
  - Use for placeholder-like metadata, low-priority icon buttons, tertiary labels.
- `link`
  - Interactive text links only.

### Border Tokens

- `border`
  - Default structural border.
  - Use for cards, panels, section dividers, table row separators.
- `input-border`
  - Input and field border.
  - Use for text inputs, comboboxes, dropdown triggers, editable chips.
- `border-focus`
  - Focus/active emphasis.
  - Use for keyboard focus rings and active borders only.
- `command-border`
  - Inactive toolbar/command border.
- `command-border-focus`
  - Active toolbar/command border.

### Interactive Tokens

- `primary-background`, `primary-foreground`, `primary-hover`
  - Primary CTA buttons only.
- `secondary-background`, `secondary-foreground`, `secondary-hover`
  - Secondary buttons and less prominent actions.
- `list-hover`
  - Hover row background for menus/lists.
- `list-active`, `list-active-foreground`
  - Selected rows in menus, listboxes, tab-like list items.
- `accent`
  - Small highlight accents only, not general-purpose backgrounds.

### Status Tokens

- `info`
- `success`
- `warning`
- `error`

Use these only for semantic status, validation, alerts, and state badges.

### Utility Tokens

- `badge-background`, `badge-foreground`
  - Pills, badges, compact chips.
- `textCodeBlockBackground`
  - Inline code background only.
- `find-match`, `find-match-selected`
  - Search highlighting only.
- `table-oddRow`
  - Zebra rows in app-owned structured tables.

## Component Mapping

### Chat Area

- Page/container background: `background`
- Chat reading surface: `editor-background`
- Primary chat text: `foreground`
- Secondary meta text: `description` or `description-muted`
- Structural separators: `border`

### Main Input

- Input surface: `input-background`
- Input text: `input-foreground`
- Input border: `input-border`
- Focus ring/border: `border-focus`
- Placeholder text: `input-placeholder`

### Dropdowns / Listboxes / Menus

- Trigger surface: `input-background`
- Trigger border: `input-border`
- Menu surface: `input-background` or `command-background`
- Menu row hover: `list-hover`
- Menu row selected: `list-active`
- Menu row selected text: `list-active-foreground`
- Supporting labels: `description` or `description-muted`

### Toolbars / Command-Like Controls

- Surface: `command-background`
- Text: `command-foreground`
- Border: `command-border`
- Active/focus border: `command-border-focus`

### Tool Call / Step Containers

- Main reading body: `editor-background`
- Toolbar/header: `command-background` or `editor-background` depending on density
- Container outline/divider: `border` or `command-border`
- Secondary text: `description`

### Config / Settings Screens

- Page background: `background`
- Cards/sections: `background` or `editor-background`
- Inputs: `input-*`
- Row hover/select states: `list-hover`, `list-active`
- Explanatory text: `description`

## Scrollbar Guidance

Scrollbar styling must also use theme tokens.

- Track: derive from `editor-background`
- Thumb default: derive from `border`
- Thumb hover: derive from `description`
- Thumb active: derive from `foreground` only if stronger emphasis is needed

Rules:

- Do not hardcode thumb/track grays.
- Do not use bright accent colors for default scrollbar state.
- Keep scrollbar styling subtle and consistent with the surrounding surface.

## Migration Rules

- If a component currently uses hardcoded grays, replace them with the closest semantic token.
- If two components use the same visual role with different tokens, standardize to the role defined above.
- If a token does not fit cleanly, add a new semantic token in `theme.ts` instead of reusing an unrelated one.

## Current Cleanup Priority

1. Remove hardcoded scrollbar colors.
2. Normalize chat area and input area token usage.
3. Normalize dropdown/listbox surfaces and hover states.
4. Normalize config rows, dialogs, and tool-call containers.
