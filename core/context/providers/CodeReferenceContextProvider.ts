import { BaseContextProvider } from "../";
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  ContextSubmenuItem,
  LoadSubmenuItemsArgs,
} from "../../index.js";

type RawReferenceItem = {
  id?: string | number;
  reference_id?: string | number;
  title?: string;
  name?: string;
  description?: string;
  summary?: string;
  content?: string;
  code?: string;
  snippet?: string;
  path?: string;
  file_path?: string;
  url?: string;
  icon?: string;
  [key: string]: any;
};

class CodeReferenceContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "reference",
    displayTitle: "Reference",
    description: "Browse and select code references",
    type: "submenu",
  };

  private getApiBaseUrl(config?: { serverApiUrl?: string }) {
    const raw =
      config?.serverApiUrl ||
      process.env.DEFAULT_SERVER_API_URL ||
      "http://localhost:8000";
    return raw.endsWith("/") ? raw : `${raw}/`;
  }

  private normalizeListResponse(payload: any): RawReferenceItem[] {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.code_reference_list)) {
      return payload.code_reference_list;
    }
    if (Array.isArray(payload?.items)) {
      return payload.items;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    return [];
  }

  private toSubmenuItem(
    item: RawReferenceItem,
    idx: number,
  ): ContextSubmenuItem {
    const id = String(
      item.id ??
        item.reference_id ??
        item.doc_id ??
        item.path ??
        item.file_path ??
        item.url ??
        idx,
    );
    const title =
      item.title ||
      item.name ||
      item.doc_name ||
      item.path ||
      item.file_path ||
      id;
    const description = item.description || item.summary || item.url || "";
    return {
      id,
      title,
      description,
      icon: item.icon,
      metadata: item,
    };
  }

  async loadSubmenuItems(
    args: LoadSubmenuItemsArgs,
  ): Promise<ContextSubmenuItem[]> {
    const endpoint = new URL(
      "code_reference_list",
      this.getApiBaseUrl(args.config),
    );
    console.log(`[CodeReference] loadSubmenuItems -> ${endpoint.toString()}`);
    const resp = await args.fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const rows = this.normalizeListResponse(data);
    return rows.map((row, idx) => this.toSubmenuItem(row, idx));
  }

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    const endpoint = new URL(
      "code_reference_list",
      this.getApiBaseUrl(extras.config),
    );
    const resp = await extras.fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const rows = this.normalizeListResponse(data);
    const submenuItems = rows.map((row, idx) => this.toSubmenuItem(row, idx));
    const selected = submenuItems.find((item) => item.id === query);

    if (!selected) {
      return [];
    }

    const meta = (selected.metadata || {}) as RawReferenceItem;
    const content =
      meta.content ||
      meta.code ||
      meta.snippet ||
      selected.description ||
      selected.title;

    return [
      {
        name: selected.title,
        description: selected.description || "Code reference",
        // Keep reference payload lightweight. The agent should resolve doc content
        // via read_reference(doc_id) using the marker injected in constructMessages.
        content: "",
        // Keep uri.value as the selected doc_id so downstream prompt/tool calls
        // can reliably use the exact backend identifier.
        uri: {
          type: "file",
          value: String(selected.id),
        },
      },
    ];
  }
}

export default CodeReferenceContextProvider;
