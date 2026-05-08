import { EventEmitter } from "events";

import type { RuntimeToolStateEvent } from "./types";

export class RuntimeEvents {
  private emitter = new EventEmitter();

  on(listener: (event: RuntimeToolStateEvent) => void) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  emit(event: RuntimeToolStateEvent) {
    this.emitter.emit("event", event);
  }
}
