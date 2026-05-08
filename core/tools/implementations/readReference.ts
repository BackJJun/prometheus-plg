import { ToolImpl } from ".";
import { getStringArg } from "../parseArgs";

type RawReferenceResponse = {
  doc_id?: string;
  id?: string;
  doc_name?: string;
  name?: string;
  content?: string;
  code?: string;
  snippet?: string;
  description?: string;
  [key: string]: any;
};

function getApiBaseUrl(config?: { serverApiUrl?: string }) {
  const raw =
    config?.serverApiUrl ||
    process.env.DEFAULT_SERVER_API_URL ||
    "http://localhost:8000";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function normalize(payload: any): RawReferenceResponse {
  if (payload && typeof payload === "object") {
    if (payload.data && typeof payload.data === "object") {
      return payload.data;
    }
    return payload;
  }
  return {};
}

export const readReferenceImpl: ToolImpl = async (args, extras) => {
  const docId = getStringArg(args, "doc_id");
  const docName = (args.doc_name as string | undefined) || "";

  const endpoint = new URL(
    `code_reference/${encodeURIComponent(docId)}`,
    getApiBaseUrl(extras.config),
  );

  const response = await extras.fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = normalize(await response.json());
  const name = data.doc_name || data.name || docName || `reference:${docId}`;
  const content = data.content || data.code || data.snippet || "";
  const description = data.description || `Reference doc_id=${docId}`;

  return [
    {
      name,
      description,
      content: String(content),
      uri: {
        type: "url",
        value: endpoint.toString(),
      },
    },
  ];
};
