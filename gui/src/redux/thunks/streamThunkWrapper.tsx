import { createAsyncThunk } from "@reduxjs/toolkit";
import posthog from "posthog-js";
import StreamErrorDialog from "../../pages/gui/StreamError";
import { analyzeError } from "../../util/errorAnalysis";
import { selectSelectedChatModel } from "../slices/configSlice";
import { setDialogMessage, setShowDialog } from "../slices/uiSlice";
import { ThunkApiType } from "../store";
import { cancelStream } from "./cancelStream";
import { saveCurrentSession } from "./session";

export const streamThunkWrapper = createAsyncThunk<
  void,
  () => Promise<void>,
  ThunkApiType
>("chat/streamWrapper", async (runStream, { dispatch, extra, getState }) => {
  try {
    await runStream();
    const state = getState();
    if (!state.session.isInEdit) {
      // Don't save if there was an authentication error
      if (!state.session.hasAuthError) {
        await dispatch(
          saveCurrentSession({
            openNewSession: false,
            generateTitle: true,
          }),
        );
      }
    }
  } catch (e) {
    await dispatch(cancelStream());

    // Extract status code from error - check multiple sources
    let errorStatus: number | undefined =
      (e as any).status || (e as any).statusCode || (e as any).response?.status;

    // Fallback: parse from error message like "HTTP 401 Unauthorized..."
    if (!errorStatus && (e as any).message) {
      const message = (e as any).message as string;
      const match = message.match(/^HTTP\s+(\d{3})/);
      if (match) {
        errorStatus = parseInt(match[1], 10);
      }
    }

    // Check for 401/Unauthorized error and skip dialog if found
    // This is handled in streamNormalInput by refreshing token
    if (errorStatus === 401) {
      return;
    }

    dispatch(setDialogMessage(<StreamErrorDialog error={e} />));
    dispatch(setShowDialog(true));

    // Get the selected model from the state for error analysis
    const state = getState();
    const selectedModel = selectSelectedChatModel(state);

    const { parsedError, statusCode, modelTitle, providerName } = analyzeError(
      e,
      selectedModel,
    );

    const errorData = {
      error_type: statusCode ? `HTTP ${statusCode}` : "Unknown",
      error_message: parsedError,
      model_provider: providerName,
      model_title: modelTitle,
    };

    posthog.capture("gui_stream_error", errorData);
  }
});
