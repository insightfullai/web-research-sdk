import type {
  BrowserSessionController,
  BrowserSessionSnapshot,
  SdkEvent,
  SessionMetadata,
  StartBrowserSessionOptions,
  WebResearchTransport,
} from "./types";
import { WebResearchEventQueue } from "./transport";

interface ElementLike {
  closest?: (selectors: string) => ElementLike | null;
  getAttribute: (qualifiedName: string) => string | null;
  hasAttribute: (qualifiedName: string) => boolean;
  tagName: string;
}

interface FormFieldLike extends ElementLike {
  value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function getElementTagName(value: unknown): string | null {
  if (!isRecord(value) || typeof value.tagName !== "string") {
    return null;
  }

  return value.tagName.toLowerCase();
}

function isElementLike(value: unknown): value is ElementLike {
  return (
    getElementTagName(value) !== null &&
    isRecord(value) &&
    typeof value.getAttribute === "function" &&
    typeof value.hasAttribute === "function"
  );
}

function hasValueProperty(value: unknown): value is { value: unknown } {
  return isRecord(value) && "value" in value;
}

function isTextInputElement(value: unknown): value is FormFieldLike {
  const tagName = getElementTagName(value);
  return hasValueProperty(value) && (tagName === "input" || tagName === "textarea");
}

function isFormFieldElement(value: unknown): value is FormFieldLike {
  const tagName = getElementTagName(value);
  return (
    hasValueProperty(value) &&
    (tagName === "input" || tagName === "textarea" || tagName === "select")
  );
}

function getInputChecked(value: unknown): boolean | undefined {
  if (getElementTagName(value) !== "input" || !isRecord(value) || !("checked" in value)) {
    return undefined;
  }

  return typeof value.checked === "boolean" ? value.checked : undefined;
}

function getElementDescriptor(target: EventTarget | null): Record<string, unknown> | null {
  if (!isElementLike(target)) {
    return null;
  }

  const element =
    target.closest?.("button, a, input, textarea, select, form, [role], [data-testid]") ?? target;
  if (!isElementLike(element)) {
    return null;
  }

  return {
    tagName: element.tagName.toLowerCase(),
    type: element.getAttribute("type") || undefined,
    role: element.getAttribute("role") || undefined,
    hasDataTestId: element.hasAttribute("data-testid") || undefined,
  };
}

function getLocationPayload(windowObject: Window, routeType: "history" | "hash" | "full_reload") {
  const hasQuery = windowObject.location.search.length > 1;
  const hasHash = windowObject.location.hash.length > 1;
  return {
    href: `${windowObject.location.origin}${windowObject.location.pathname}`,
    path: windowObject.location.pathname,
    routeType,
    hasQuery,
    hasHash,
    titleLength: windowObject.document.title.trim().length,
  };
}

export class BrowserWebResearchSession implements BrowserSessionController {
  private readonly queue: WebResearchEventQueue;
  private readonly options: StartBrowserSessionOptions;

  private windowObject: Window | undefined;
  private started = false;
  private capturedEvents = 0;
  private completionPromise: Promise<void> | undefined;
  private teardownCallbacks: Array<() => void> = [];

  public constructor(options: {
    session: SessionMetadata;
    transport: WebResearchTransport;
    batching?: StartBrowserSessionOptions["batching"];
    runtimeOptions?: StartBrowserSessionOptions;
  }) {
    this.options = options.runtimeOptions ?? {};
    this.queue = new WebResearchEventQueue(
      options.batching
        ? {
            session: options.session,
            transport: options.transport,
            batching: options.batching,
          }
        : {
            session: options.session,
            transport: options.transport,
          },
    );
  }

  public start(): void {
    if (this.started) {
      return;
    }

    const windowObject = this.options.window ?? globalThis.window;
    const documentObject = this.options.document ?? windowObject?.document;
    if (!windowObject || !documentObject) {
      throw new Error("Browser session requires a window and document");
    }

    this.windowObject = windowObject;
    this.started = true;

    this.addEventListener(
      documentObject,
      "click",
      (event) => {
        this.recordEvent({
          name: "dom.click",
          payload: {
            element: getElementDescriptor(event.target),
          },
        });
      },
      true,
    );

    this.addEventListener(
      documentObject,
      "input",
      (event) => {
        if (!isTextInputElement(event.target)) {
          return;
        }

        this.recordEvent({
          name: "dom.input",
          payload: {
            element: getElementDescriptor(event.target),
            valueLength: String(event.target.value).length,
          },
        });
      },
      true,
    );

    this.addEventListener(
      documentObject,
      "change",
      (event) => {
        if (!isFormFieldElement(event.target)) {
          return;
        }

        this.recordEvent({
          name: "dom.change",
          payload: {
            element: getElementDescriptor(event.target),
            valueLength: String(event.target.value).length,
            checked: getInputChecked(event.target),
          },
        });
      },
      true,
    );

    this.addEventListener(
      documentObject,
      "submit",
      (event) => {
        this.recordEvent({
          name: "dom.submit",
          payload: {
            element: getElementDescriptor(event.target),
          },
        });
      },
      true,
    );

    this.patchHistoryMethod("pushState", "history");
    this.patchHistoryMethod("replaceState", "history");

    this.addEventListener(windowObject, "popstate", () => {
      this.recordNavigation("history");
    });
    this.addEventListener(windowObject, "hashchange", () => {
      this.recordNavigation("hash");
    });

    if (this.options.captureInitialNavigation !== false) {
      this.recordNavigation("full_reload");
    }
  }

  public async flush(reason = "manual"): Promise<void> {
    await this.queue.flush(reason);
  }

  public async complete(reason = "complete"): Promise<void> {
    this.stopCapture();
    this.completionPromise ??= this.queue.complete(reason);
    await this.completionPromise;
  }

  public async destroy(reason = "destroy"): Promise<void> {
    this.stopCapture();
    this.completionPromise ??= this.queue.complete(reason);
    await this.completionPromise;
  }

  public getSnapshot(): BrowserSessionSnapshot {
    const queueSnapshot = this.queue.getSnapshot();
    return queueSnapshot.lastFlushAt
      ? {
          active: this.started,
          capturedEvents: this.capturedEvents,
          bufferedEvents: queueSnapshot.bufferedEvents,
          lastFlushAt: queueSnapshot.lastFlushAt,
        }
      : {
          active: this.started,
          capturedEvents: this.capturedEvents,
          bufferedEvents: queueSnapshot.bufferedEvents,
        };
  }

  private addEventListener(
    target: Document | Window,
    type: string,
    listener: EventListenerOrEventListenerObject,
    capture = false,
  ): void {
    target.addEventListener(type, listener, capture);
    this.teardownCallbacks.push(() => target.removeEventListener(type, listener, capture));
  }

  private patchHistoryMethod(method: "pushState" | "replaceState", routeType: "history"): void {
    const windowObject = this.windowObject;
    if (!windowObject) {
      return;
    }

    const originalMethod = windowObject.history[method].bind(windowObject.history) as (
      ...args: unknown[]
    ) => unknown;
    windowObject.history[method] = ((...args: unknown[]) => {
      const result = originalMethod(...args);
      this.recordNavigation(routeType);
      return result;
    }) as History[typeof method];

    this.teardownCallbacks.push(() => {
      windowObject.history[method] = originalMethod as History[typeof method];
    });
  }

  private recordNavigation(routeType: "history" | "hash" | "full_reload"): void {
    if (!this.windowObject) {
      return;
    }

    this.recordEvent({
      name: "navigation",
      payload: getLocationPayload(this.windowObject, routeType),
    });
  }

  private recordEvent(event: SdkEvent): void {
    if (!this.started) {
      return;
    }

    this.capturedEvents += 1;
    this.queue.enqueue(event, "browser");
  }

  private stopCapture(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    for (const teardown of this.teardownCallbacks.splice(0, this.teardownCallbacks.length)) {
      teardown();
    }
    this.windowObject = undefined;
  }
}
