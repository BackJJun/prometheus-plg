import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export const readReferenceTool: Tool = {
  type: "function",
  displayTitle: "Read Reference",
  wouldLikeTo: "read reference {{{ doc_id }}}",
  isCurrently: "reading reference {{{ doc_id }}}",
  hasAlready: "read reference {{{ doc_id }}}",
  readonly: true,
  isInstant: true,
  group: BUILT_IN_GROUP_NAME,
  function: {
    name: BuiltInToolNames.ReadReference,
    description:
      "Reads a selected reference document from the backend by doc_id. Use this when a reference was selected via @ Reference. Do NOT use read_file for reference documents.",
    parameters: {
      type: "object",
      required: ["doc_id"],
      properties: {
        doc_id: {
          type: "string",
          description: "The selected reference document id",
        },
        doc_name: {
          type: "string",
          description: "Optional reference document name for display",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithoutPermission",
  systemMessageDescription: {
    prefix: `To read a selected backend reference document, use the ${BuiltInToolNames.ReadReference} tool.`,
    exampleArgs: [["doc_id", "5a29e202-6980-4437-9450-890decc25039"]],
  },
  toolCallIcon: "BookOpenIcon",
};
