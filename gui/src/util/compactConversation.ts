import { ModelDescription } from "core";
import { useContext } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { selectSelectedChatModel } from "../redux/slices/configSlice";
import {
  deleteCompaction,
  setCompactionLoading,
} from "../redux/slices/sessionSlice";
import { loadSession, saveCurrentSession } from "../redux/thunks/session";

export const useCompactConversation = () => {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const currentSessionId = useAppSelector((state) => state.session.id);
  const selectedChatModel = useAppSelector(selectSelectedChatModel);

  return async (index: number) => {
    if (!currentSessionId) {
      return;
    }

    try {
      // Set loading state
      dispatch(setCompactionLoading({ index, loading: true }));

      await ideMessenger.request("conversation/compact", {
        index,
        sessionId: currentSessionId,
        modelDescription:
          (selectedChatModel as ModelDescription | null) ?? undefined,
      });

      // Reload the current session to refresh the conversation state
      dispatch(
        loadSession({
          sessionId: currentSessionId,
          saveCurrentSession: false,
        }),
      );
    } catch (error) {
      console.error("Error compacting conversation:", error);
    } finally {
      // Clear loading state
      dispatch(setCompactionLoading({ index, loading: false }));
    }
  };
};

export const useDeleteCompaction = () => {
  const dispatch = useAppDispatch();

  return (index: number) => {
    // Update local state and save to persistence
    dispatch(deleteCompaction(index));
    dispatch(
      saveCurrentSession({
        openNewSession: false,
        generateTitle: false,
      }),
    );
  };
};
