# Disabled Tools

This document tracks tools that have been temporarily disabled from the plugin.

## ls Tool

**Status**: Disabled  
**Date**: 2026-01-15  
**Reason**: Tool should not be used at this time

### Location

The `lsTool` is commented out in:

- `core/tools/index.ts` - `getBaseToolDefinitions()` function

### How to Re-enable

To re-enable the ls tool, uncomment the following line in `core/tools/index.ts`:

```typescript
// toolDefinitions.lsTool,
```

Change to:

```typescript
toolDefinitions.lsTool,
```

### Notes

- The tool definition code is preserved in `core/tools/definitions/ls.ts`
- No code was deleted, only commented out
- This prevents the tool from appearing in UI and being sent in API calls
