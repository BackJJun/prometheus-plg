import { ContextItemWithId } from "core";

export interface GetContextRequest {
  provider: string;
  query?: string;
  resolvedContextItem?: ContextItemWithId;
}
