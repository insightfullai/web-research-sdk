import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type IframeHTMLAttributes,
  type MutableRefObject,
  type Ref,
} from "react";

import type { AnyBridgeMessage, WebResearchClient } from "@insightfull/web-research-sdk";

import {
  useMaybeWebResearchClient,
  useOverlayBridgeSnapshot,
  useOverlayBridgeStatus,
} from "./context";

type OverlayIframeElement = HTMLIFrameElement;

type OverlayIframeBaseProps = Omit<
  IframeHTMLAttributes<OverlayIframeElement>,
  "allow" | "children" | "onLoad" | "ref" | "sandbox" | "src"
>;

export interface OverlayBridgeHostOptions {
  client?: WebResearchClient;
  iframeRef?: MutableRefObject<OverlayIframeElement | null>;
  src: string;
  targetOrigin?: string;
  autoBeginHandshake?: boolean;
  terminateOnUnmount?: boolean;
}

export interface OverlayBridgeIframeProps extends OverlayIframeBaseProps {
  ref: Ref<OverlayIframeElement>;
  src: string;
  onLoad: () => void;
  allow: string;
  sandbox: string;
  referrerPolicy: HTMLIFrameElement["referrerPolicy"];
}

export interface OverlayBridgeHostResult {
  iframeProps: OverlayBridgeIframeProps;
  snapshot: ReturnType<typeof useOverlayBridgeSnapshot>;
  status: ReturnType<typeof useOverlayBridgeStatus>;
  postMessage: (message: AnyBridgeMessage) => void;
}

export interface OverlayBridgeFrameProps extends OverlayBridgeHostOptions, OverlayIframeBaseProps {
  title?: string;
  allow?: string;
  sandbox?: string;
  style?: CSSProperties;
}

const DEFAULT_IFRAME_ALLOW = "microphone; camera; autoplay";
const DEFAULT_IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";

function assignRef<TValue>(ref: Ref<TValue> | undefined, value: TValue): void {
  if (!ref) {
    return;
  }

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  ref.current = value;
}

function resolveTargetOrigin(src: string, explicitTargetOrigin?: string): string | null {
  const candidate = explicitTargetOrigin ?? src;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function useOverlayBridgeHost(options: OverlayBridgeHostOptions): OverlayBridgeHostResult {
  const contextClient = useMaybeWebResearchClient();
  const client = options.client ?? contextClient;

  if (!client) {
    throw new Error("useOverlayBridgeHost requires a client option or WebResearchProvider");
  }

  const snapshot = useOverlayBridgeSnapshot(client);
  const status = useOverlayBridgeStatus(client);
  const internalIframeRef = useRef<OverlayIframeElement | null>(null);

  const mergedRef = useCallback(
    (node: OverlayIframeElement | null) => {
      internalIframeRef.current = node;
      if (options.iframeRef) {
        options.iframeRef.current = node;
      }
    },
    [options.iframeRef],
  );

  const targetOrigin = useMemo(
    () => resolveTargetOrigin(options.src, options.targetOrigin),
    [options.src, options.targetOrigin],
  );

  const postMessage = useCallback(
    (message: AnyBridgeMessage) => {
      const iframeWindow = internalIframeRef.current?.contentWindow;
      if (!iframeWindow || !targetOrigin) {
        return;
      }

      iframeWindow.postMessage(message, targetOrigin);
    },
    [targetOrigin],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    client.bridge.mount();

    const handleMessage = (event: MessageEvent<unknown>) => {
      const iframeWindow = internalIframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) {
        return;
      }

      const result = client.bridge.receiveMessage(event.data, {
        origin: event.origin,
        dispatch: postMessage,
      });

      if (
        options.autoBeginHandshake !== false &&
        !result.duplicate &&
        result.accepted &&
        result.message?.type === "overlay:hello"
      ) {
        client.bridge.beginHandshake(result.message, { dispatch: postMessage });
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      if (options.terminateOnUnmount !== false) {
        client.bridge.terminate("iframe_unmount");
      }
    };
  }, [client, options.autoBeginHandshake, options.terminateOnUnmount, postMessage]);

  return {
    iframeProps: {
      ref: mergedRef,
      src: options.src,
      onLoad: () => {
        client.bridge.markIframeLoaded();
      },
      allow: DEFAULT_IFRAME_ALLOW,
      sandbox: DEFAULT_IFRAME_SANDBOX,
      referrerPolicy: "strict-origin-when-cross-origin",
    },
    snapshot,
    status,
    postMessage,
  };
}

export function OverlayBridgeFrame(props: OverlayBridgeFrameProps) {
  const { title = "Insightfull overlay", allow, sandbox, ...rest } = props;
  const { iframeProps } = useOverlayBridgeHost(props);

  return createElement("iframe", {
    ...rest,
    ...iframeProps,
    title,
    allow: allow ?? iframeProps.allow,
    sandbox: sandbox ?? iframeProps.sandbox,
  });
}

export function mergeOverlayIframeRef<TValue>(
  ...refs: Array<Ref<TValue> | undefined>
): (value: TValue) => void {
  return (value) => {
    for (const ref of refs) {
      assignRef(ref, value);
    }
  };
}
