import { describe, expect, it, vi } from "vitest";
import { EventQueue } from "../event-queue/event-queue.js";
import type { SdkEvent } from "../types/index.js";

function makeEvent(type: SdkEvent["type"] = "event"): SdkEvent {
	return { type, timestamp: Date.now() };
}

describe("EventQueue", () => {
	it("push adds events to the queue", () => {
		const onFlush = vi.fn().mockResolvedValue(undefined);
		const queue = new EventQueue({
			maxSize: 10,
			batchSize: 5,
			onFlush,
		});

		queue.push(makeEvent());
		queue.push(makeEvent());
		expect(queue.size()).toBe(2);
	});

	it("flush sends batch and removes sent events", async () => {
		const onFlush = vi.fn().mockResolvedValue(undefined);
		const queue = new EventQueue({
			maxSize: 100,
			batchSize: 5,
			onFlush,
		});

		for (let i = 0; i < 8; i++) {
			queue.push(makeEvent());
		}

		await queue.flush();

		// 8 events, batch size 5 → 2 batches (5 + 3)
		expect(onFlush).toHaveBeenCalledTimes(2);
		expect(onFlush).toHaveBeenNthCalledWith(
			1,
			expect.arrayContaining([expect.any(Object)])
		);
		expect(queue.size()).toBe(0);
	});

	it("drops oldest event when at max capacity", async () => {
		const onFlush = vi.fn().mockResolvedValue(undefined);
		const queue = new EventQueue({
			maxSize: 3,
			batchSize: 5,
			onFlush,
		});

		const event1 = { type: "event" as const, timestamp: 1 };
		const event2 = { type: "event" as const, timestamp: 2 };
		const event3 = { type: "event" as const, timestamp: 3 };
		const event4 = { type: "event" as const, timestamp: 4 };

		queue.push(event1);
		queue.push(event2);
		queue.push(event3);
		queue.push(event4); // Should drop event1

		expect(queue.size()).toBe(3);

		// Flush to inspect contents
		const flushedEvents: SdkEvent[] = [];
		const capturingQueue = new EventQueue({
			maxSize: 3,
			batchSize: 10,
			onFlush: (batch) => {
				flushedEvents.push(...batch);
			},
		});

		capturingQueue.push(event1);
		capturingQueue.push(event2);
		capturingQueue.push(event3);
		capturingQueue.push(event4);

		await capturingQueue.flush();
		expect(flushedEvents).toHaveLength(3);
		expect(flushedEvents[0].timestamp).toBe(2); // event1 dropped
	});

	it("does not call onFlush when queue is empty", async () => {
		const onFlush = vi.fn().mockResolvedValue(undefined);
		const queue = new EventQueue({
			maxSize: 100,
			batchSize: 5,
			onFlush,
		});

		await queue.flush();
		expect(onFlush).not.toHaveBeenCalled();
	});

	it("respects batch size", async () => {
		const batches: SdkEvent[][] = [];
		const queue = new EventQueue({
			maxSize: 100,
			batchSize: 3,
			onFlush: (batch) => {
				batches.push(batch);
			},
		});

		for (let i = 0; i < 7; i++) {
			queue.push(makeEvent());
		}

		await queue.flush();

		expect(batches).toHaveLength(3); // 3 + 3 + 1
		expect(batches[0]).toHaveLength(3);
		expect(batches[1]).toHaveLength(3);
		expect(batches[2]).toHaveLength(1);
	});

	it("puts events back on flush failure", async () => {
		let callCount = 0;
		const queue = new EventQueue({
			maxSize: 100,
			batchSize: 10,
			onFlush: () => {
				callCount++;
				if (callCount === 1) {
					throw new Error("Network error");
				}
			},
		});

		for (let i = 0; i < 3; i++) {
			queue.push(makeEvent());
		}

		await queue.flush();
		expect(queue.size()).toBe(3); // Events put back on failure
	});

	it("clear removes all events", () => {
		const onFlush = vi.fn().mockResolvedValue(undefined);
		const queue = new EventQueue({
			maxSize: 100,
			batchSize: 5,
			onFlush,
		});

		queue.push(makeEvent());
		queue.push(makeEvent());
		queue.clear();
		expect(queue.size()).toBe(0);
	});
});
