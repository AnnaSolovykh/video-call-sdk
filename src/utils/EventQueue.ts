/**
 * Asynchronous event queue for guaranteed sequential processing.
 * Ensures signaling and transport operations are processed in order.
 */
export class EventQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  /**
   * Add task to queue and process sequentially.
   */
  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process queue sequentially - one task at a time.
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch (error) {
        console.error('[EventQueue] Task failed:', error);
        // Continue processing other tasks
      }
    }

    this.processing = false;
  }

  /**
   * Get current queue size.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is currently processing.
   */
  get isProcessing(): boolean {
    return this.processing;
  }
}
