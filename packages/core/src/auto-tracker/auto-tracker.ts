/**
 * Auto-tracker — intercepts browser navigation to track pageviews.
 * Uses history API interception + popstate listener.
 */

export type TrackCallback = (
	eventName: string,
	payload?: Record<string, unknown>
) => void;

export class AutoTracker {
	private readonly trackCallback: TrackCallback;
	private originalPushState: typeof history.pushState | null = null;
	private originalReplaceState: typeof history.replaceState | null = null;
	private readonly handlePopState: () => void;

	constructor(trackCallback: TrackCallback) {
		this.trackCallback = trackCallback;
		this.handlePopState = () => {
			this.trackPageview();
		};
	}

	/**
	 * Start auto-tracking pageviews.
	 * Tracks the initial pageview and sets up history API interception.
	 */
	start(): void {
		// Track initial pageview
		this.trackPageview();

		// Intercept history API
		this.interceptHistory();

		// Listen for popstate (back/forward navigation)
		window.addEventListener("popstate", this.handlePopState);
	}

	/**
	 * Stop auto-tracking and restore original history methods.
	 */
	stop(): void {
		// Restore original history methods
		if (this.originalPushState) {
			history.pushState = this.originalPushState;
		}
		if (this.originalReplaceState) {
			history.replaceState = this.originalReplaceState;
		}

		// Remove event listener
		window.removeEventListener("popstate", this.handlePopState);

		this.originalPushState = null;
		this.originalReplaceState = null;
	}

	private interceptHistory(): void {
		// Capture originals in local constants — guaranteed non-null here
		const origPush = history.pushState.bind(history);
		const origReplace = history.replaceState.bind(history);

		this.originalPushState = origPush;
		this.originalReplaceState = origReplace;

		const self = this;

		history.pushState = function (
			data: unknown,
			unused: string,
			url?: string | URL | null
		) {
			origPush.call(this, data, unused, url);
			self.trackPageview();
		};

		history.replaceState = function (
			data: unknown,
			unused: string,
			url?: string | URL | null
		) {
			origReplace.call(this, data, unused, url);
			self.trackPageview();
		};
	}

	private trackPageview(): void {
		this.trackCallback("pageview", {
			path: window.location.pathname,
			url: window.location.href,
		});
	}
}
