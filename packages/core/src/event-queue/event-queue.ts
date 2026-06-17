/**
 * In-memory event queue with batching and size limits.
 */

import type { SdkEvent } from "../types/index.js";

export interface EventQueueOptions {
	batchSize: number;
	maxSize: number;
	onFlush: (batch: SdkEvent[]) => void | Promise<void>;
}

export class EventQueue {
	private queue: SdkEvent[] = [];
	private readonly maxSize: number;
	private readonly batchSize: number;
	private readonly onFlush: (batch: SdkEvent[]) => void | Promise<void>;

	constructor(options: EventQueueOptions) {
		this.maxSize = options.maxSize;
		this.batchSize = options.batchSize;
		this.onFlush = options.onFlush;
	}

	/**
	 * Push an event onto the queue.
	 * If the queue is at max capacity, the oldest event is dropped.
	 */
	push(event: SdkEvent): void {
		if (this.queue.length >= this.maxSize) {
			this.queue.shift();
		}
		this.queue.push(event);
	}

	/**
	 * Flush queued events in batches.
	 * Sends up to `batchSize` events per call to onFlush.
	 * Successfully sent events are removed from the queue.
	 */
	async flush(): Promise<void> {
		while (this.queue.length > 0) {
			const batch = this.queue.splice(0, this.batchSize);
			try {
				await this.onFlush(batch);
			} catch {
				// Put failed events back at the front of the queue
				this.queue.unshift(...batch);
				break;
			}
		}
	}

	/** Current number of events in the queue. */
	size(): number {
		return this.queue.length;
	}

	/** Clear all events from the queue. */
	clear(): void {
		this.queue = [];
	}
}
