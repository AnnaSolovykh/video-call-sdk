/**
 * Generic typed EventEmitter with compile-time event type checking.
 * Ensures type safety for event names and payload types.
 */
export class TypedEventEmitter<TEventMap extends Record<string, any>> {
  private listeners = new Map<keyof TEventMap, Array<(data: any) => void>>();

  /**
   * Subscribe to an event with type-safe event name and payload.
   */
  on<K extends keyof TEventMap>(
    event: K,
    listener: TEventMap[K] extends void ? () => void : (data: TEventMap[K]) => void
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener as any);
    return this;
  }

  /**
   * Unsubscribe from an event.
   */
  off<K extends keyof TEventMap>(
    event: K,
    listener: TEventMap[K] extends void ? () => void : (data: TEventMap[K]) => void
  ): this {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(listener as any);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Emit an event with type-safe payload.
   */
  emit<K extends keyof TEventMap>(
    event: K,
    ...args: TEventMap[K] extends void ? [] : [TEventMap[K]]
  ): boolean {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.length === 0) {
      return false;
    }

    handlers.forEach(handler => {
      try {
        handler(args[0]);
      } catch (error) {
        console.error(`[TypedEventEmitter] Error in event handler for '${String(event)}':`, error);
      }
    });

    return true;
  }

  /**
   * Subscribe to an event only once.
   */
  once<K extends keyof TEventMap>(
    event: K,
    listener: TEventMap[K] extends void ? () => void : (data: TEventMap[K]) => void
  ): this {
    const onceWrapper = (data: TEventMap[K]) => {
      this.off(event, onceWrapper as any);
      (listener as any)(data);
    };

    return this.on(event, onceWrapper as any);
  }

  /**
   * Remove all listeners for a specific event, or all events if no event specified.
   */
  removeAllListeners<K extends keyof TEventMap>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  /**
   * Get count of listeners for an event.
   */
  listenerCount<K extends keyof TEventMap>(event: K): number {
    return this.listeners.get(event)?.length || 0;
  }

  /**
   * Get all event names that have listeners.
   */
  eventNames(): Array<keyof TEventMap> {
    return Array.from(this.listeners.keys());
  }
}
