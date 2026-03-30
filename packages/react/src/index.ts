import type { ReactNode } from "react";
import {
  createWebResearchClient,
  type WebResearchClient,
  type WebResearchClientOptions,
} from "../../core/src/index";

export type { WebResearchClient, WebResearchClientOptions };

export interface WebResearchOverlayProviderProps {
  children: ReactNode;
  mountId?: string;
}

export function createReactWebResearchClient(options: WebResearchClientOptions): WebResearchClient {
  return createWebResearchClient(options);
}

export function createOverlayProviderProps(
  props: WebResearchOverlayProviderProps,
): Required<WebResearchOverlayProviderProps> {
  return {
    children: props.children,
    mountId: props.mountId ?? "insightfull-overlay-root",
  };
}
