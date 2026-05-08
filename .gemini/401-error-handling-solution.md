# 401 Error Handling Solution

## Problem

When a 401 Unauthorized error occurs during chat API calls:

- Using `throw e` prevented session save (good) but also prevented the login dialog from showing (bad)
- Using `return` showed the login dialog (good) but allowed session save when there were multiple messages (bad)

## Root Cause

The issue was that `throw e` interrupts the execution flow before the `auth:logout` event can be properly processed by React event handlers, while `return` allows the wrapper to treat it as a successful completion and proceed to save.

## Solution

Implemented a Redux state flag (`hasAuthError`) to track authentication errors:

### Changes Made

1. **Added `hasAuthError` flag to SessionState** (`gui/src/redux/slices/sessionSlice.ts`)

   - Added `hasAuthError?: boolean` to the `SessionState` type
   - Created `setAuthError` reducer to set this flag
   - Exported the `setAuthError` action
   - Reset the flag in `setActive` when starting a new stream

2. **Updated error handling in `streamNormalInput`** (`gui/src/redux/thunks/streamNormalInput.ts`)

   - Import `setAuthError` action
   - On 401 error:
     - Delete the failed message from history
     - Clear localStorage tokens
     - Show toast notification
     - Dispatch `auth:logout` event
     - **Set `hasAuthError` flag to `true`**
     - **Return (not throw)** to allow event processing

3. **Updated `streamThunkWrapper`** (`gui/src/redux/thunks/streamThunkWrapper.tsx`)
   - Check `state.session.hasAuthError` before calling `saveCurrentSession`
   - Skip save if the flag is true

## Flow

1. 401 error occurs → `streamNormalInput` catches it
2. Cleanup: remove message, clear tokens, show toast
3. Set `hasAuthError = true` in Redux state
4. Dispatch `auth:logout` event
5. **Return** (allows event to propagate)
6. `streamThunkWrapper` checks `hasAuthError` flag
7. If true, skip `saveCurrentSession`
8. Login dialog shows (because event was processed)
9. Next stream starts → `setActive` resets `hasAuthError = false`

## Result

✅ Session is NOT saved on 401 error (regardless of message count)
✅ Login dialog appears correctly
✅ User can re-authenticate and continue
✅ After login, user is redirected to chat history page with refreshed session list

## Post-Login Behavior

After successful login (`gui/src/context/Auth.tsx`):

1. Start a new session (`newSession(undefined)`)
2. Reload session list (`refreshSessionMetadata({})`)
3. Navigate to history page (`navigate("/history")`)

This ensures the user sees the chat history list instead of the previous chat session.
