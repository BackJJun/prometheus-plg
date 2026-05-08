export class RuntimeAbortRegistry {
  private controllers = new Map<string, AbortController>();

  create(turnId: string) {
    const controller = new AbortController();
    this.controllers.set(turnId, controller);
    return controller;
  }

  get(turnId: string) {
    return this.controllers.get(turnId);
  }

  abort(turnId: string) {
    const controller = this.controllers.get(turnId);
    if (!controller) {
      return false;
    }
    controller.abort();
    this.controllers.delete(turnId);
    return true;
  }

  clear(turnId: string) {
    this.controllers.delete(turnId);
  }
}
