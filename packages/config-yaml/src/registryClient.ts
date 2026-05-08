import * as fs from "node:fs";
import * as path from "node:path";
import { Registry } from "./interfaces/index.js";
import { FullSlug, PackageIdentifier } from "./interfaces/slugs.js";

interface RegistryClientOptions {
  accessToken?: string;
  apiBase?: string;
  rootPath?: string;
}

export class RegistryClient implements Registry {
  private readonly accessToken?: string;
  private readonly apiBase: string;
  private readonly rootPath?: string;

  constructor(options: RegistryClientOptions = {}) {
    this.accessToken = options.accessToken;
    this.apiBase = options.apiBase ?? "https://api.continue.dev/";
    this.rootPath = options.rootPath;
    if (!this.apiBase.endsWith("/")) {
      this.apiBase += "/";
    }
  }

  async getContent(id: PackageIdentifier): Promise<string> {
    switch (id.uriType) {
      case "file":
        return this.getContentFromFilePath(id.fileUri);
      case "slug":
        return this.getContentFromSlug(id.fullSlug);
      default:
        throw new Error(
          `Unknown package identifier type: ${(id as any).uriType}`,
        );
    }
  }

  private getContentFromFilePath(filepath: string): string {
    try {
      if (filepath.startsWith("file://")) {
        // For Windows file:///C:/path/to/file, we need to handle it properly
        // On other systems, we might have file:///path/to/file
        return fs.readFileSync(new URL(filepath), "utf8");
      } else if (path.isAbsolute(filepath)) {
        return fs.readFileSync(filepath, "utf8");
      } else if (this.rootPath) {
        return fs.readFileSync(path.join(this.rootPath, filepath), "utf8");
      } else {
        throw new Error("No rootPath provided for relative file path");
      }
    } catch (error) {
      // If file doesn't exist, return default config template
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const serverApiUrl =
          process.env.DEFAULT_SERVER_API_URL || "http://localhost:8000";
        const defaultConfig = `name: "prometheus"
version: "1.0.0"
server_api_url: "${serverApiUrl}"
`;
        console.log(
          `[RegistryClient] Config file not found at ${filepath}, using default template with server_api_url: ${serverApiUrl}`,
        );
        return defaultConfig;
      }
      // Re-throw other errors
      throw error;
    }
  }

  private async getContentFromSlug(fullSlug: FullSlug): Promise<string> {
    const response = await fetch(
      `${this.apiBase}registry/v1/${fullSlug.ownerSlug}/${fullSlug.packageSlug}/${fullSlug.versionSlug}`,
      {
        headers: {
          ...(this.accessToken
            ? { Authorization: `Bearer ${this.accessToken}` }
            : {}),
        },
      },
    );
    const data = await response.json();
    return data.content;
  }
}
