import { ConfigResult, ConfigValidationError } from "@continuedev/config-yaml";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { BrowserSerializedContinueConfig, Tool } from "core";
import { loadRemoteModels } from "../thunks/loadRemoteModels";

export type ConfigState = {
  configError: ConfigValidationError[] | undefined;
  config: BrowserSerializedContinueConfig;
  loading: boolean;
};

export const EMPTY_CONFIG: BrowserSerializedContinueConfig = {
  slashCommands: [],
  contextProviders: [],
  tools: [],
  mcpServerStatuses: [],
  usePlatform: true,
  modelsByRole: {
    chat: [],
    apply: [],
    edit: [],
    summarize: [],
    autocomplete: [],
    rerank: [],
    embed: [],
  },
  selectedModelByRole: {
    chat: null,
    apply: null,
    edit: null,
    summarize: null,
    autocomplete: null,
    rerank: null,
    embed: null,
  },
  rules: [],
  serverApiUrl: undefined,
};

export const INITIAL_CONFIG_SLICE: ConfigState = {
  configError: undefined,
  config: EMPTY_CONFIG,
  loading: false,
};

const BUILT_IN_GROUP_NAME = "Built-In";
const CHAT_SESSION_CONTEXT_LENGTH = 258_000;

function fallbackTool(
  name: string,
  description: string,
  parameters: Tool["function"]["parameters"],
  readonly: boolean,
): Tool {
  return {
    type: "function",
    displayTitle: name,
    wouldLikeTo: `use ${name}`,
    isCurrently: `using ${name}`,
    hasAlready: `used ${name}`,
    group: BUILT_IN_GROUP_NAME,
    readonly,
    function: {
      name,
      description,
      parameters,
    },
    defaultToolPolicy: readonly
      ? "allowedWithoutPermission"
      : "allowedWithPermission",
  };
}

function fallbackTools(): Tool[] {
  const filepathProperty = {
    type: "string",
    description: "Path relative to the root of the workspace.",
  };

  return [
    fallbackTool(
      "read_file",
      "Read the contents of a file in the workspace.",
      {
        type: "object",
        required: ["filepath"],
        properties: { filepath: filepathProperty },
      },
      true,
    ),
    fallbackTool(
      "create_new_file",
      "Create a new file in the workspace.",
      {
        type: "object",
        required: ["filepath", "contents"],
        properties: {
          filepath: filepathProperty,
          contents: {
            type: "string",
            description: "The complete contents of the new file.",
          },
        },
      },
      false,
    ),
    fallbackTool(
      "edit_existing_file",
      "Replace the complete contents of an existing file.",
      {
        type: "object",
        required: ["filepath", "changes"],
        properties: {
          filepath: filepathProperty,
          changes: {
            type: "string",
            description: "The complete modified file contents.",
          },
        },
      },
      false,
    ),
    fallbackTool(
      "single_find_and_replace",
      "Perform an exact string replacement in a file.",
      {
        type: "object",
        required: ["filepath", "old_string", "new_string"],
        properties: {
          filepath: filepathProperty,
          old_string: { type: "string" },
          new_string: { type: "string" },
          replace_all: { type: "boolean" },
        },
      },
      false,
    ),
    fallbackTool(
      "run_terminal_command",
      "Run a terminal command in the workspace.",
      {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string" },
          waitForCompletion: { type: "boolean" },
        },
      },
      false,
    ),
    fallbackTool(
      "file_glob_search",
      "Find files by glob pattern.",
      {
        type: "object",
        required: ["pattern"],
        properties: { pattern: { type: "string" } },
      },
      true,
    ),
    fallbackTool(
      "grep_search",
      "Search workspace files for text or a regular expression.",
      {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
      true,
    ),
  ];
}

function withDefaultToolsIfMissing(
  config: BrowserSerializedContinueConfig,
): BrowserSerializedContinueConfig {
  if (config.tools.length > 0) {
    return config;
  }

  return {
    ...config,
    tools: fallbackTools(),
  };
}

export const configSlice = createSlice({
  name: "config",
  initialState: INITIAL_CONFIG_SLICE,
  reducers: {
    setConfigResult: (
      state,
      {
        payload: result,
      }: PayloadAction<ConfigResult<BrowserSerializedContinueConfig>>,
    ) => {
      const { config, errors } = result;
      if (!errors || errors.length === 0) {
        state.configError = undefined;
      } else {
        state.configError = errors;
      }

      // If an error is found in config on save,
      // We must invalidate the GUI config too,
      // Since core won't be able to load config
      // Don't invalidate the loaded config
      if (!config) {
        state.config = EMPTY_CONFIG;
      } else {
        // Preserve existing models loaded from /api/models
        // Config updates should not overwrite API-loaded models
        const preservedModels = state.config.modelsByRole;
        const preservedSelected = state.config.selectedModelByRole;
        const hasApiModels = preservedModels.chat.length > 0;

        state.config = withDefaultToolsIfMissing({
          ...config,
          // Keep API models if they exist, otherwise use config models (which are now empty)
          modelsByRole: hasApiModels ? preservedModels : config.modelsByRole,
          selectedModelByRole: hasApiModels
            ? preservedSelected
            : config.selectedModelByRole,
        });
      }
      state.loading = false;
    },
    updateConfig: (
      state,
      { payload: config }: PayloadAction<BrowserSerializedContinueConfig>,
    ) => {
      state.config = config;
    },
    setConfigLoading: (state, { payload: loading }: PayloadAction<boolean>) => {
      state.loading = loading;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadRemoteModels.fulfilled, (state, action) => {
      // Transform API models to match the expected structure
      const { models: apiModels, defaultModelId } = action.payload;

      if (apiModels && apiModels.length > 0) {
        // Group models by role
        const modelsByRole: any = {
          chat: [],
          apply: [],
          edit: [],
          summarize: [],
          autocomplete: [],
          rerank: [],
          embed: [],
        };

        apiModels.forEach((model) => {
          const roles = model.roles || ["chat"];
          roles.forEach((role: string) => {
            if (modelsByRole[role]) {
              modelsByRole[role].push(model);
            }
          });
        });

        // Set default selected model for each role
        const selectedModelByRole: any = {
          chat: null,
          apply: null,
          edit: null,
          summarize: null,
          autocomplete: null,
          rerank: null,
          embed: null,
        };

        // For each role, select the default model if specified, otherwise first available
        Object.keys(modelsByRole).forEach((role) => {
          if (modelsByRole[role].length > 0) {
            if (defaultModelId) {
              // Try to find the model matching defaultModelId
              const defaultModel = modelsByRole[role].find(
                (m: any) => m.model === defaultModelId,
              );
              selectedModelByRole[role] = defaultModel || modelsByRole[role][0];
            } else {
              selectedModelByRole[role] = modelsByRole[role][0];
            }
          }
        });

        // Update config with API models and selected models
        state.config = withDefaultToolsIfMissing({
          ...state.config,
          modelsByRole,
          selectedModelByRole,
        });

        console.log("[configSlice] Updated models from API:", modelsByRole);
        console.log(
          "[configSlice] Selected models (defaultModelId:",
          defaultModelId,
          "):",
          selectedModelByRole,
        );
      }
    });
  },
  selectors: {
    selectSelectedChatModelContextLength: (state): number => {
      return (
        state.config.selectedModelByRole.chat?.contextLength ||
        CHAT_SESSION_CONTEXT_LENGTH
      );
    },
    selectSelectedChatModel: (state) => {
      return state.config.selectedModelByRole.chat;
    },
    selectUIConfig: (state) => {
      return state.config?.ui ?? null;
    },
  },
});

export const { updateConfig, setConfigResult, setConfigLoading } =
  configSlice.actions;

export const {
  selectSelectedChatModelContextLength,
  selectUIConfig,
  selectSelectedChatModel,
} = configSlice.selectors;

export default configSlice.reducer;
