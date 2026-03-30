import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  createWebResearchClient,
  type OverlayBridgeSnapshot,
  type WebResearchClient,
  type WebResearchClientOptions,
} from "@insightfull/web-research-sdk";

export type { OverlayBridgeSnapshot, WebResearchClient, WebResearchClientOptions };

const WebResearchClientContext = createContext<WebResearchClient | null>(null);

export interface WebResearchProviderProps {
  children?: ReactNode;
  client?: WebResearchClient;
  clientOptions?: WebResearchClientOptions;
  destroyOnUnmount?: boolean;
}

export interface OverlayBridgeStatus {
  lifecycleState: OverlayBridgeSnapshot["state"];
  isReady: boolean;
  isDegraded: boolean;
  isTerminated: boolean;
  isHandshakePending: boolean;
}

export function createReactWebResearchClient(options: WebResearchClientOptions): WebResearchClient {
  return createWebResearchClient(options);
}

function getOrCreateClient(props: WebResearchProviderProps): WebResearchClient {
  if (props.client) {
    return props.client;
  }

  if (!props.clientOptions) {
    throw new Error("WebResearchProvider requires either client or clientOptions");
  }

  return createReactWebResearchClient(props.clientOptions);
}

export function WebResearchProvider(props: WebResearchProviderProps) {
  const createdClientRef = useRef<WebResearchClient | null>(null);
  const ownsClient = !props.client;

  const client = useMemo(() => {
    if (props.client) {
      createdClientRef.current = null;
      return props.client;
    }

    if (!createdClientRef.current) {
      createdClientRef.current = getOrCreateClient(props);
    }

    return createdClientRef.current;
  }, [props]);

  useEffect(() => {
    if (!ownsClient || props.destroyOnUnmount === false) {
      return;
    }

    return () => {
      createdClientRef.current?.destroy("provider_unmount");
      createdClientRef.current = null;
    };
  }, [ownsClient, props.destroyOnUnmount]);

  return createElement(WebResearchClientContext.Provider, { value: client }, props.children);
}

export function useWebResearchClient(): WebResearchClient {
  const client = useContext(WebResearchClientContext);

  if (!client) {
    throw new Error("useWebResearchClient must be used within a WebResearchProvider");
  }

  return client;
}

export function useMaybeWebResearchClient(): WebResearchClient | null {
  return useContext(WebResearchClientContext);
}

function useResolvedWebResearchClient(
  client: WebResearchClient | undefined,
  consumerName: string,
): WebResearchClient {
  const contextClient = useMaybeWebResearchClient();
  const resolvedClient = client ?? contextClient;

  if (!resolvedClient) {
    throw new Error(`${consumerName} requires a client argument or WebResearchProvider`);
  }

  return resolvedClient;
}

export function useOverlayBridgeSnapshot(client?: WebResearchClient): OverlayBridgeSnapshot {
  const resolvedClient = useResolvedWebResearchClient(client, "useOverlayBridgeSnapshot");
  const snapshotRef = useRef(resolvedClient.bridge.getSnapshot());
  snapshotRef.current = resolvedClient.bridge.getSnapshot();

  return useSyncExternalStore(
    (listener) =>
      resolvedClient.bridge.subscribe((snapshot) => {
        snapshotRef.current = snapshot;
        listener();
      }),
    () => snapshotRef.current,
    () => snapshotRef.current,
  );
}

export function getOverlayBridgeStatus(snapshot: OverlayBridgeSnapshot): OverlayBridgeStatus {
  return {
    lifecycleState: snapshot.state,
    isReady: snapshot.state === "READY",
    isDegraded: snapshot.state === "DEGRADED",
    isTerminated: snapshot.state === "TERMINATED",
    isHandshakePending: snapshot.state === "HANDSHAKE_PENDING",
  };
}

export function useOverlayBridgeStatus(client?: WebResearchClient): OverlayBridgeStatus {
  const resolvedClient = useResolvedWebResearchClient(client, "useOverlayBridgeStatus");
  return getOverlayBridgeStatus(useOverlayBridgeSnapshot(resolvedClient));
}
