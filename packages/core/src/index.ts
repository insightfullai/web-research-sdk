import type { SdkEvent, SessionMetadata } from "../../shared/src/index";

export interface WebResearchClientOptions {
  apiKey: string;
  endpoint?: string;
}

export interface WebResearchClient {
  getSession: () => SessionMetadata;
  track: (event: SdkEvent) => Promise<void>;
}

const DEFAULT_ENDPOINT = "https://api.insightfull.ai/web-research";

class InMemoryWebResearchClient implements WebResearchClient {
  private readonly session: SessionMetadata;

  public constructor() {
    this.session = {
      sessionId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    };
  }

  public getSession(): SessionMetadata {
    return this.session;
  }

  public async track(event: SdkEvent): Promise<void> {
    void event;
  }
}

export function createWebResearchClient(options: WebResearchClientOptions): WebResearchClient {
  if (!options.apiKey) {
    throw new Error("apiKey is required");
  }

  void (options.endpoint ?? DEFAULT_ENDPOINT);

  return new InMemoryWebResearchClient();
}
