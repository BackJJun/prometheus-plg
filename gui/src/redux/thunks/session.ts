import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { BaseSessionMetadata, ChatMessage, Session } from "core";
import { RemoteSessionMetadata } from "core/control-plane/client";
import { NEW_SESSION_TITLE } from "core/util/constants";
import { renderChatMessage } from "core/util/messageContent";
import {
  deleteSession as apiDeleteSession,
  getLastSession as apiGetLastSession,
  getSession as apiGetSession,
  listSessions,
  saveSession,
} from "../../api";
import { IIdeMessenger } from "../../context/IdeMessenger";
import { normalizeWorkspaceDirectory } from "../../util";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  deleteSessionMetadata,
  newSession,
  setAllSessionMetadata,
  setIsSessionMetadataLoading,
  updateSessionMetadata,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";

const MAX_TITLE_LENGTH = 100;

// Async session functions live in thunks (because of IDE messaging mostly)
// see sessionSlice for sync redux session functions

export async function getSession(
  ideMessenger: IIdeMessenger,
  id: string,
  accessToken?: string | null,
): Promise<Session> {
  // Use centralized API function
  const session = await apiGetSession(id);
  return session;
}

export async function getRemoteSession(
  ideMessenger: IIdeMessenger,
  remoteId: string,
): Promise<Session> {
  const result = await ideMessenger.request("history/loadRemote", { remoteId });
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.content;
}

export const refreshSessionMetadata = createAsyncThunk<
  RemoteSessionMetadata[] | BaseSessionMetadata[],
  {
    offset?: number;
    limit?: number;
  },
  ThunkApiType
>("session/refreshMetadata", async ({ offset, limit }, { dispatch, extra }) => {
  // Use centralized API function
  const sessions = await listSessions({ limit, offset });

  dispatch(setIsSessionMetadataLoading(false));
  dispatch(setAllSessionMetadata(sessions));
  return sessions;
});

export const deleteSession = createAsyncThunk<void, string, ThunkApiType>(
  "session/delete",
  async (id, { getState, dispatch, extra }) => {
    dispatch(deleteSessionMetadata(id)); // optimistic
    const state = getState();
    if (id === state.session.id) {
      await dispatch(loadLastSession());
    }
    // Use centralized API function
    await apiDeleteSession(id);
    void dispatch(refreshSessionMetadata({}));
  },
);

export const updateSession = createAsyncThunk<void, Session, ThunkApiType>(
  "session/update",
  async (session, { extra, dispatch }) => {
    dispatch(
      updateSessionMetadata({
        sessionId: session.sessionId,
        title: session.title,
      }),
    ); // optimistic session metadata update

    // Use centralized API function
    await saveSession(session);
    // Removed refreshSessionMetadata call - no need to fetch session list after saving
  },
);

/*
 this is only used for the custom focusContinueSessionId command at the moment
*/
export const loadSession = createAsyncThunk<
  void,
  {
    sessionId: string;
    saveCurrentSession: boolean;
  },
  ThunkApiType
>(
  "session/load",
  async ({ sessionId, saveCurrentSession: save }, { extra, dispatch }) => {
    if (save) {
      const result = await dispatch(
        saveCurrentSession({
          openNewSession: false,
          generateTitle: true,
        }),
      );
      unwrapResult(result);
    }
    // Get access token from localStorage
    const accessToken = localStorage.getItem("access_token");
    const session = await getSession(
      extra.ideMessenger,
      sessionId,
      accessToken,
    );
    dispatch(newSession(session));
  },
);

export const loadRemoteSession = createAsyncThunk<
  void,
  {
    remoteId: string;
    saveCurrentSession: boolean;
  },
  ThunkApiType
>(
  "session/loadRemote",
  async ({ remoteId, saveCurrentSession: save }, { extra, dispatch }) => {
    if (save) {
      const result = await dispatch(
        saveCurrentSession({
          openNewSession: false,
          generateTitle: true,
        }),
      );
      unwrapResult(result);
    }
    const session = await getRemoteSession(extra.ideMessenger, remoteId);
    dispatch(newSession(session));
  },
);

export const loadLastSession = createAsyncThunk<void, void, ThunkApiType>(
  "session/loadLast",
  async (_, { extra, dispatch, getState }) => {
    const workspacePaths = window.workspacePaths ?? [];
    let workspaceDirectory = workspacePaths[0] || "";

    if (!workspaceDirectory) {
      dispatch(newSession());
      return;
    }

    // Normalize workspace directory to match DB format
    workspaceDirectory = normalizeWorkspaceDirectory(workspaceDirectory);

    try {
      console.log(
        "[loadLastSession] Requesting last session for:",
        workspaceDirectory,
      );

      // Use centralized API function
      const session = await apiGetLastSession(workspaceDirectory);
      console.log("[loadLastSession] API Result:", session);

      if (session && session.sessionId) {
        console.log("[loadLastSession] Loading session:", session.sessionId);
        dispatch(newSession(session));
      } else {
        console.warn(
          "[loadLastSession] No last session found, starting new session",
        );
        dispatch(newSession());
      }
    } catch (e) {
      console.error("[loadLastSession] Exception:", e);
      dispatch(newSession());
    }
  },
);

function getChatTitleFromMessage(message: ChatMessage) {
  const text =
    renderChatMessage(message)
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(-1)[0] || "";

  // Truncate
  if (text.length > MAX_TITLE_LENGTH) {
    return text.slice(0, MAX_TITLE_LENGTH - 3) + "...";
  }
  return text;
}

export const saveCurrentSession = createAsyncThunk<
  void,
  { openNewSession: boolean; generateTitle: boolean },
  ThunkApiType
>(
  "session/saveCurrent",
  async ({ openNewSession, generateTitle }, { dispatch, extra, getState }) => {
    const state = getState();
    if (state.session.history.length === 0) {
      return;
    }

    if (openNewSession) {
      dispatch(newSession());
    }

    // New session has already been dispatched
    // Now save previous session and update chat title if relevant
    let title = state.session.title;
    if (title === NEW_SESSION_TITLE) {
      const selectedChatModel = selectSelectedChatModel(state);

      if (!state.config.config?.disableSessionTitles && selectedChatModel) {
        let assistantResponse = state.session.history
          ?.filter((h) => h.message.role === "assistant")[0]
          ?.message?.content?.toString();

        if (assistantResponse && generateTitle) {
          try {
            const result = await extra.ideMessenger.request(
              "chatDescriber/describe",
              {
                text: assistantResponse,
                modelDescription: selectedChatModel,
              },
            );
            if (result.status === "success" && result.content) {
              title = result.content;
            }
          } catch (e) {
            console.error("Error generating chat title", e);
          }
        }
      }
      // Fallbacks if above doesn't work out or session titles disabled
      if (title === NEW_SESSION_TITLE) {
        title = getChatTitleFromMessage(state.session.history[0].message);
      }
    }
    // More fallbacks in case of no title
    if (!title.length) {
      const metadata = getState().session.allSessionMetadata.find(
        (m) => m.sessionId === state.session.id,
      );
      if (metadata?.title) {
        title = metadata.title;
      }
    }
    if (!title.length) {
      title = NEW_SESSION_TITLE;
    }

    const session: Session = {
      sessionId: state.session.id,
      title,
      workspaceDirectory: normalizeWorkspaceDirectory(
        window.workspacePaths?.[0] || "",
      ),
      history: state.session.history,
    };

    const result = await dispatch(updateSession(session));
    unwrapResult(result);
  },
);
