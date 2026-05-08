import { expect, test } from "vitest";
import { BuiltInToolNames } from "./builtIn";
import { getConfigDependentToolDefinitions } from "./index";

test("searchWeb tool is only available when user is signed in", async () => {
  const mockIde = {
    getWorkspaceDirs: async () => [],
    fileExists: async () => false,
  } as any;

  // Test with signed-in user
  const signedInTools = await getConfigDependentToolDefinitions({
    rules: [],
    enableExperimentalTools: false,
    isSignedIn: true,
    isRemote: false,
    modelName: "",
    ide: mockIde,
  });

  const searchWebToolSignedIn = signedInTools.find(
    (tool) => tool.function.name === BuiltInToolNames.SearchWeb,
  );
  expect(searchWebToolSignedIn).toBeDefined();
  expect(searchWebToolSignedIn?.displayTitle).toBe("Search Web");

  // Test with non-signed-in user
  const notSignedInTools = await getConfigDependentToolDefinitions({
    rules: [],
    enableExperimentalTools: false,
    isSignedIn: false,
    isRemote: false,
    modelName: "",
    ide: mockIde,
  });

  const searchWebToolNotSignedIn = notSignedInTools.find(
    (tool) => tool.function.name === BuiltInToolNames.SearchWeb,
  );
  expect(searchWebToolNotSignedIn).toBeUndefined();
});
