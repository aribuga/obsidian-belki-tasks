export class InitializationGate {
  private promise: Promise<void> | null = null;

  run(operation: () => Promise<void>): Promise<void> {
    if (this.promise) {
      return this.promise;
    }

    this.promise = operation().finally(() => {
      this.promise = null;
    });
    return this.promise;
  }

  isRunning(): boolean {
    return this.promise !== null;
  }
}
