import { fetchwithRequestOptions } from "@continuedev/fetch";
import { ChatMessage, IDE, PromptLog } from "..";
import { ConfigHandler } from "../config/ConfigHandler";
import { usesCreditsBasedApiKey } from "../config/usesFreeTrialApiKey";
import { llmFromDescription } from "../llm/llms";
import { FromCoreProtocol, ToCoreProtocol } from "../protocol";
import { IMessenger, Message } from "../protocol/messenger";
import { Telemetry } from "../util/posthog";
import { TTS } from "../util/tts";
import { isOutOfStarterCredits } from "./utils/starterCredits";

function shouldDebugRawChatStream(): boolean {
  return process.env.DEBUG_RAW_CHAT_STREAM === "1";
}

export async function* llmStreamChat(
  configHandler: ConfigHandler,
  abortController: AbortController,
  msg: Message<ToCoreProtocol["llm/streamChat"][0]>,
  ide: IDE,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
): AsyncGenerator<ChatMessage, PromptLog> {
  const { config } = await configHandler.loadConfig();
  if (!config) {
    throw new Error("Config not loaded");
  }

  // Stop TTS on new StreamChat
  if (config.experimental?.readResponseTTS) {
    void TTS.kill();
  }

  const {
    legacySlashCommandData,
    completionOptions,
    messages,
    messageOptions,
    modelDescription,
    requestId, // 재시도 시 서버 캐시 활용을 위한 요청 식별자
  } = msg.data;

  if (shouldDebugRawChatStream()) {
    console.log(
      "[LLM_STREAM_CHAT_MODE]",
      JSON.stringify({
        hasLegacySlashCommandData: !!legacySlashCommandData,
      }),
    );
  }

  // requestId를 completionOptions에 병합
  const finalCompletionOptions = {
    ...completionOptions,
    ...(requestId && { requestId }),
  };

  // Use model from GUI if provided (API model), otherwise fall back to config
  let model = config.selectedModelByRole.chat;

  // If modelDescription is provided from GUI (API model), convert it to ILLM
  if (modelDescription) {
    const ideSettings = await ide.getIdeSettings();
    const readFile = (filepath: string) => ide.readFile(filepath);
    const getUriFromPath = async (path: string) => undefined; // Not needed for API models

    const convertedModel = await llmFromDescription(
      modelDescription,
      readFile,
      getUriFromPath,
      "", // uniqueId - empty string for now
      ideSettings,
      undefined as any, // llmLogger - will use default
      config.completionOptions,
      { serverApiUrl: config.serverApiUrl }, // Pass serverApiUrl
    );

    if (convertedModel) {
      model = convertedModel;
    }
  }

  if (!model) {
    throw new Error("No chat model selected");
  }

  // Log to return in case of error
  const errorPromptLog = {
    modelTitle: model?.title ?? model?.model,
    modelProvider: model?.underlyingProviderName ?? "unknown",
    completion: "",
    prompt: "",
    completionOptions: {
      ...msg.data.completionOptions,
      model: model?.model,
    },
  };

  try {
    if (legacySlashCommandData) {
      const { command, contextItems, historyIndex, input, selectedCode } =
        legacySlashCommandData;
      const slashCommand = config.slashCommands?.find(
        (sc) => sc.name === command.name,
      );
      if (!slashCommand) {
        throw new Error(`Unknown slash command ${command.name}`);
      }
      void Telemetry.capture(
        "useSlashCommand",
        {
          name: command.name,
        },
        true,
      );
      if (!slashCommand.run) {
        console.error(
          `Slash command ${command.name} (${command.source}) has no run function`,
        );
        throw new Error(`Slash command not found`);
      }

      const gen = slashCommand.run({
        input,
        history: messages,
        llm: model,
        contextItems,
        params: command.params,
        ide,
        addContextItem: (item) => {
          void messenger.request("addContextItem", {
            item,
            historyIndex,
          });
        },
        selectedCode,
        config,
        fetch: (url, init) =>
          fetchwithRequestOptions(
            url,
            {
              ...init,
              signal: abortController.signal,
            },
            model.requestOptions,
          ),
        completionOptions,
        abortController,
      });
      let next = await gen.next();
      while (!next.done) {
        if (abortController.signal.aborted) {
          next = await gen.return(errorPromptLog);
          break;
        }
        if (next.value) {
          yield {
            role: "assistant",
            content: next.value,
          };
        }
        next = await gen.next();
      }
      if (!next.done) {
        throw new Error("Will never happen");
      }

      return next.value;
    } else {
      const gen = model.streamChat(
        messages,
        abortController.signal,
        finalCompletionOptions,
        messageOptions,
      );
      let next = await gen.next();
      while (!next.done) {
        if (abortController.signal.aborted) {
          next = await gen.return(errorPromptLog);
          break;
        }

        const chunk = next.value;
        if (shouldDebugRawChatStream()) {
          console.log(
            "[CORE_STREAM_OUT]",
            JSON.stringify({
              role: (chunk as any)?.role,
              contentPreview:
                typeof (chunk as any)?.content === "string"
                  ? (chunk as any).content.slice(0, 80)
                  : Array.isArray((chunk as any)?.content)
                    ? JSON.stringify((chunk as any).content).slice(0, 120)
                    : "",
            }),
          );
        }

        yield chunk;
        next = await gen.next();
      }
      if (config.experimental?.readResponseTTS && "completion" in next.value) {
        void TTS.read(next.value?.completion);
      }

      void Telemetry.capture(
        "chat",
        {
          model: model.model,
          provider: model.providerName,
        },
        true,
      );

      void checkForOutOfStarterCredits(configHandler, messenger);

      if (!next.done) {
        throw new Error("Will never happen");
      }

      return next.value;
    }
  } catch (error) {
    // Moved error handling that was here to GUI, keeping try/catch for clean diff
    throw error;
  }
}

async function checkForOutOfStarterCredits(
  configHandler: ConfigHandler,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
) {
  try {
    const { config } = await configHandler.getSerializedConfig();
    const creditStatus =
      await configHandler.controlPlaneClient.getCreditStatus();

    if (
      config &&
      creditStatus &&
      isOutOfStarterCredits(usesCreditsBasedApiKey(config), creditStatus)
    ) {
      void messenger.request("freeTrialExceeded", undefined);
    }
  } catch (error) {
    console.error("Error checking free trial status:", error);
  }
}
