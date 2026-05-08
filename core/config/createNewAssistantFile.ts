import { IDE } from "..";
import { joinPathsToUri } from "../util/uri";

const DEFAULT_ASSISTANT_FILE = () => {
  const serverApiUrl =
    process.env.DEFAULT_SERVER_API_URL || "http://localhost:8000";
  return `name: "prometheus"
version: "1.0.0"
server_api_url: "${serverApiUrl}"
`;
};

export async function createNewAssistantFile(
  ide: IDE,
  assistantPath: string | undefined,
): Promise<void> {
  const workspaceDirs = await ide.getWorkspaceDirs();
  if (workspaceDirs.length === 0) {
    throw new Error(
      "No workspace directories found. Make sure you've opened a folder in your IDE.",
    );
  }

  const baseDirUri = joinPathsToUri(
    workspaceDirs[0],
    assistantPath ?? ".prometheus/agents",
  );

  // Find the first available filename
  let counter = 0;
  let assistantFileUri: string;
  do {
    const suffix = counter === 0 ? "" : `-${counter}`;
    assistantFileUri = joinPathsToUri(baseDirUri, `new-config${suffix}.yaml`);
    counter++;
  } while (await ide.fileExists(assistantFileUri));

  await ide.writeFile(assistantFileUri, DEFAULT_ASSISTANT_FILE());
  await ide.openFile(assistantFileUri);
}
