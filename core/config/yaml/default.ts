import { AssistantUnrolled } from "@continuedev/config-yaml";

// TODO
export const defaultConfigYaml: AssistantUnrolled = {
  name: "prometheus",
  version: "1.0.0",
  server_api_url: process.env.DEFAULT_SERVER_API_URL || "http://localhost:8000",
};

export const defaultConfigYamlJetBrains: AssistantUnrolled = {
  name: "prometheus",
  version: "1.0.0",
  server_api_url: process.env.DEFAULT_SERVER_API_URL || "http://localhost:8000",
};
