import {
  BRIDGE_CAPABILITIES,
  BRIDGE_MESSAGE_SPECS,
  BRIDGE_NAMESPACE,
  BRIDGE_RETRY_POLICY,
  BRIDGE_VERSION,
  type AnyBridgeMessage,
  type BridgeCapability,
  type BridgeMessage,
  type BridgeMessagePayloadMap,
  type BridgeMessageType,
  type BridgeVersion,
} from "./protocol";
import { validateBridgeMessage } from "./validation";

import type {
  BridgeOriginValidationInput,
  BridgeOriginValidationResult,
  BridgeReceiveResult,
  BridgeRetryPolicyConfig,
  BridgeRuntimeDiagnostic,
  BridgeVersionSupportResult,
  CreateBridgeMessageEnvelopeOptions,
  IncomingBridgeMessageContext,
  OverlayBridgeController,
  OverlayBridgeSnapshot,
  SendBridgeMessageOptions,
  SdkToOverlayMessageType,
  WebResearchBridgeOptions,
} from "./types";

const DEFAULT_HELLO_TIMEOUT_MS = 5_000;
const DEFAULT_READY_TIMEOUT_MS = 5_000;
const DEFAULT_ENDPOINT_PARENT_ORIGIN = "https://api.insightfull.ai";

type TimerApi = Pick<typeof globalThis, "setTimeout" | "clearTimeout">;

interface BridgeRuntimeDependencies extends TimerApi {
  now: () => number;
  generateId: () => string;
}

interface PendingAckEntry {
  envelope: AnyBridgeMessage;
  dispatch?: (message: AnyBridgeMessage) => void;
  retries: number;
  timerId?: ReturnType<typeof setTimeout>;
  criticalOnFailure: boolean;
  suppressTimeoutRetries: boolean;
}

interface HandshakeTracker {
  initMessageId: string;
  retries: number;
  timerId?: ReturnType<typeof setTimeout>;
}

interface MessageDecisionRecord {
  accepted: boolean;
  response?: BridgeMessage<"bridge:ack"> | BridgeMessage<"bridge:nack">;
  reason?: string;
}

interface SemanticValidationFailure {
  reason: string;
  fatal: boolean;
}

function withOptional<TObject extends object, TKey extends string, TValue>(
  target: TObject,
  key: TKey,
  value: TValue | undefined,
): TObject & Partial<Record<TKey, TValue>> {
  if (value === undefined) {
    return target;
  }

  return {
    ...target,
    [key]: value,
  };
}

function normalizeOrigin(origin: string): string | null {
  if (!origin || origin === "*" || origin === "null") {
    return null;
  }

  try {
    const normalizedOrigin = new URL(origin);
    if (normalizedOrigin.protocol !== "https:") {
      return null;
    }

    return normalizedOrigin.origin;
  } catch {
    return null;
  }
}

function createReadonlySequenceSnapshot(source: Map<string, number>): Record<string, number> {
  return Object.fromEntries(source.entries());
}

function intersectsCapabilities(
  left: readonly BridgeCapability[],
  right: readonly BridgeCapability[],
): BridgeCapability[] {
  const rightSet = new Set(right);
  return left.filter((capability) => rightSet.has(capability));
}

export const SUPPORTED_BRIDGE_VERSIONS = [BRIDGE_VERSION] as const;

export function validateSupportedBridgeVersion(version: string): BridgeVersionSupportResult {
  return {
    requestedVersion: version,
    supportedVersions: SUPPORTED_BRIDGE_VERSIONS,
    isSupported: SUPPORTED_BRIDGE_VERSIONS.includes(version as BridgeVersion),
  };
}

export function validateBridgeOrigin(
  input: BridgeOriginValidationInput,
): BridgeOriginValidationResult {
  const expectedOrigin = normalizeOrigin(input.expectedOrigin);
  const actualOrigin = normalizeOrigin(input.actualOrigin);
  const allowedOrigins = (input.allowedOrigins ?? [])
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => origin !== null);

  if (!expectedOrigin) {
    return {
      success: false,
      code: "BRG_ORIGIN_MISMATCH",
      reason: "expectedOrigin must be an explicit https origin",
    };
  }

  if (!actualOrigin) {
    return {
      success: false,
      code: "BRG_ORIGIN_MISMATCH",
      reason: "actualOrigin must be an explicit https origin",
    };
  }

  if (actualOrigin !== expectedOrigin && !allowedOrigins.includes(actualOrigin)) {
    return {
      success: false,
      code: "BRG_ORIGIN_MISMATCH",
      reason: `origin ${actualOrigin} does not match configured iframe origin`,
    };
  }

  return { success: true, normalizedOrigin: actualOrigin };
}

export function createBridgeMessageEnvelope<TType extends BridgeMessageType>(
  options: CreateBridgeMessageEnvelopeOptions<TType>,
): BridgeMessage<TType> {
  const envelope = {
    namespace: BRIDGE_NAMESPACE,
    version: BRIDGE_VERSION,
    type: options.type,
    messageId: options.messageId ?? crypto.randomUUID(),
    sequence: options.sequence,
    sentAtMs: options.sentAtMs ?? Date.now(),
    sessionId: options.sessionId,
    bridgeInstanceId: options.bridgeInstanceId,
    requiresAck: BRIDGE_MESSAGE_SPECS[options.type].requiresAck,
    payload: options.payload,
  };

  return withOptional(
    withOptional(envelope, "overlayInstanceId", options.overlayInstanceId),
    "correlationId",
    options.correlationId,
  ) as BridgeMessage<TType>;
}

export class OverlayBridgeRuntime implements OverlayBridgeController {
  private readonly iframeOrigin: string;
  private readonly parentOrigin: string;
  private readonly helloTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly supportedVersions: readonly BridgeVersion[];
  private readonly supportedCapabilities: readonly BridgeCapability[];
  private readonly retryPolicy: Required<BridgeRetryPolicyConfig>;
  private readonly dependencies: BridgeRuntimeDependencies;
  private readonly sessionId: string;
  private readonly bridgeInstanceId: string;
  private readonly handshakeOptions?: WebResearchBridgeOptions["handshake"];

  private state: OverlayBridgeSnapshot["state"] = "UNMOUNTED";
  private selectedVersion?: BridgeVersion;
  private overlayInstanceId?: string;
  private negotiatedCapabilities: BridgeCapability[] = [];
  private sequence = 0;
  private readonly diagnostics: BridgeRuntimeDiagnostic[] = [];
  private readonly subscribers = new Set<(snapshot: OverlayBridgeSnapshot) => void>();
  private readonly lastSequenceBySender = new Map<string, number>();
  private readonly messageDecisions = new Map<string, MessageDecisionRecord>();
  private readonly pendingAcks = new Map<string, PendingAckEntry>();
  private helloTimerId?: ReturnType<typeof setTimeout>;
  private handshake?: HandshakeTracker;

  public constructor(options: {
    sessionId: string;
    bridgeInstanceId: string;
    bridge?: WebResearchBridgeOptions;
    dependencies?: Partial<BridgeRuntimeDependencies>;
  }) {
    this.sessionId = options.sessionId;
    this.bridgeInstanceId = options.bridgeInstanceId;
    this.iframeOrigin = options.bridge?.iframeOrigin ?? DEFAULT_ENDPOINT_PARENT_ORIGIN;
    this.parentOrigin = options.bridge?.parentOrigin ?? DEFAULT_ENDPOINT_PARENT_ORIGIN;
    this.helloTimeoutMs = options.bridge?.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS;
    this.readyTimeoutMs = options.bridge?.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.supportedVersions = options.bridge?.supportedVersions ?? SUPPORTED_BRIDGE_VERSIONS;
    this.supportedCapabilities = options.bridge?.supportedCapabilities ?? BRIDGE_CAPABILITIES;
    this.retryPolicy = {
      ackTimeoutMs: options.bridge?.retryPolicy?.ackTimeoutMs ?? BRIDGE_RETRY_POLICY.ackTimeoutMs,
      maxRetries: options.bridge?.retryPolicy?.maxRetries ?? BRIDGE_RETRY_POLICY.maxRetries,
      backoffMs: options.bridge?.retryPolicy?.backoffMs ?? BRIDGE_RETRY_POLICY.backoffMs,
    };
    this.handshakeOptions = options.bridge?.handshake;
    this.dependencies = {
      now: options.dependencies?.now ?? (() => Date.now()),
      generateId: options.dependencies?.generateId ?? (() => crypto.randomUUID()),
      setTimeout: options.dependencies?.setTimeout ?? globalThis.setTimeout.bind(globalThis),
      clearTimeout: options.dependencies?.clearTimeout ?? globalThis.clearTimeout.bind(globalThis),
    };
  }

  public mount(): void {
    if (this.state === "TERMINATED") {
      return;
    }

    this.transitionTo("IFRAME_LOADING");
  }

  public markIframeLoaded(): void {
    if (this.state === "TERMINATED") {
      return;
    }

    this.transitionTo("HANDSHAKE_PENDING");
    this.scheduleHelloTimeout();
  }

  public getState(): OverlayBridgeSnapshot["state"] {
    return this.state;
  }

  public getSnapshot(): OverlayBridgeSnapshot {
    const snapshot = {
      state: this.state,
      bridgeInstanceId: this.bridgeInstanceId,
      sessionId: this.sessionId,
      negotiatedCapabilities: [...this.negotiatedCapabilities],
      lastSequenceBySender: createReadonlySequenceSnapshot(this.lastSequenceBySender),
      pendingAckMessageIds: [...this.pendingAcks.keys()],
      diagnostics: [...this.diagnostics],
    };

    return withOptional(
      withOptional(snapshot, "overlayInstanceId", this.overlayInstanceId),
      "selectedVersion",
      this.selectedVersion,
    ) as OverlayBridgeSnapshot;
  }

  public subscribe(listener: (snapshot: OverlayBridgeSnapshot) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public sendMessage<TType extends SdkToOverlayMessageType>(
    type: TType,
    payload: BridgeMessagePayloadMap[TType],
    options?: SendBridgeMessageOptions,
  ): BridgeMessage<TType> {
    const envelopeOptions = withOptional(
      withOptional(
        {
          type,
          payload,
          sessionId: this.sessionId,
          bridgeInstanceId: this.bridgeInstanceId,
          messageId: this.dependencies.generateId(),
          sequence: ++this.sequence,
          sentAtMs: this.dependencies.now(),
        },
        "overlayInstanceId",
        options?.overlayInstanceId ?? this.overlayInstanceId,
      ),
      "correlationId",
      options?.correlationId,
    );

    const envelope = createBridgeMessageEnvelope(envelopeOptions);

    options?.dispatch?.(envelope as AnyBridgeMessage);

    if (envelope.requiresAck && options?.trackAck !== false) {
      this.trackPendingAck(envelope as AnyBridgeMessage, {
        criticalOnFailure: options?.criticalOnFailure ?? false,
        suppressTimeoutRetries: envelope.type === "overlay:init",
        ...withOptional({}, "dispatch", options?.dispatch),
      });
    }

    return envelope;
  }

  public receiveMessage(
    input: unknown,
    context: IncomingBridgeMessageContext,
  ): BridgeReceiveResult {
    const originResult = validateBridgeOrigin({
      expectedOrigin: this.iframeOrigin,
      actualOrigin: context.origin,
    });

    if (!originResult.success) {
      this.emitDiagnostic(originResult.code, originResult.reason, { origin: context.origin });
      this.terminate(originResult.reason);
      return {
        accepted: false,
        duplicate: false,
        reason: originResult.reason,
      };
    }

    const validationResult = validateBridgeMessage(input);
    if (!validationResult.success) {
      this.emitDiagnostic(validationResult.error.code, validationResult.error.message, {
        issues: validationResult.error.issues,
      });

      if (validationResult.error.code === "BRG_PROTOCOL_VERSION_UNSUPPORTED") {
        this.transitionTo("DEGRADED");
      }

      return {
        accepted: false,
        duplicate: false,
        reason: validationResult.error.message,
      };
    }

    const message = validationResult.value;
    const existingDecision = this.messageDecisions.get(message.messageId);
    if (existingDecision) {
      this.emitDiagnostic("BRG_DUPLICATE_MESSAGE", "Duplicate message ignored", {
        messageId: message.messageId,
        type: message.type,
      });
      if (existingDecision.response) {
        context.dispatch?.(existingDecision.response);
      }
      return {
        accepted: existingDecision.accepted,
        duplicate: true,
        message,
        ...withOptional({}, "response", existingDecision.response),
        ...withOptional({}, "reason", existingDecision.reason),
      };
    }

    this.trackIncomingSequence(message);

    if (message.type === "bridge:ack") {
      this.resolvePendingAck(message.payload.ackMessageId);
      return this.recordDecision(message, { accepted: true });
    }

    if (message.type === "bridge:nack") {
      this.handleNack(message.payload.ackMessageId, message.payload.retryable);
      return this.recordDecision(message, { accepted: true });
    }

    const semanticError = this.validateSemanticState(message);
    if (semanticError) {
      if (semanticError.fatal) {
        this.emitDiagnostic("BRG_SCHEMA_INVALID", semanticError.reason, {
          messageId: message.messageId,
          type: message.type,
        });
        this.terminate(semanticError.reason);
        return this.recordDecision(message, {
          accepted: false,
          reason: semanticError.reason,
        });
      }

      const response = this.createNackMessage(
        message.messageId,
        semanticError.reason,
        message.type,
      );
      context.dispatch?.(response);
      return this.recordDecision(message, {
        accepted: false,
        response,
        reason: semanticError.reason,
      });
    }

    if (message.type === "overlay:hello") {
      this.clearHelloTimeout();
      this.overlayInstanceId = message.payload.overlayInstanceId;

      if (!this.handshakeOptions) {
        const response = this.createAckMessage(
          message.messageId,
          message.payload.overlayInstanceId,
        );
        context.dispatch?.(response);
        return this.recordDecision(
          message,
          response ? { accepted: true, response } : { accepted: true },
        );
      }
    }

    if (message.type === "overlay:ready") {
      this.overlayInstanceId = message.payload.overlayInstanceId;
      this.negotiatedCapabilities = [...message.payload.acceptedCapabilities];
      this.transitionTo("READY");
      this.clearHandshakeTimer();
    }

    const response = message.requiresAck
      ? this.createAckMessage(message.messageId, message.overlayInstanceId)
      : undefined;

    if (response) {
      context.dispatch?.(response);
    }

    return this.recordDecision(
      message,
      response ? { accepted: true, response } : { accepted: true },
    );
  }

  public beginHandshake(
    helloMessage: Extract<AnyBridgeMessage, { type: "overlay:hello" }>,
    options?: { dispatch?: (message: AnyBridgeMessage) => void },
  ): BridgeMessage<"overlay:init"> {
    if (!this.handshakeOptions) {
      throw new Error("bridge.handshake is required to begin handshake");
    }

    const negotiatedVersion = this.supportedVersions.find((version) =>
      helloMessage.payload.supportedVersions.includes(version),
    );

    if (!negotiatedVersion) {
      this.emitDiagnostic("BRG_PROTOCOL_VERSION_UNSUPPORTED", "No compatible bridge version", {
        supportedVersions: helloMessage.payload.supportedVersions,
      });
      this.transitionTo("DEGRADED");
      throw new Error("No compatible bridge version available");
    }

    const authorizedCapabilities =
      this.handshakeOptions.authorizedCapabilities ?? BRIDGE_CAPABILITIES;
    const selectedCapabilities = intersectsCapabilities(
      intersectsCapabilities(this.supportedCapabilities, helloMessage.payload.capabilities),
      authorizedCapabilities,
    );

    this.selectedVersion = negotiatedVersion;
    this.overlayInstanceId = helloMessage.payload.overlayInstanceId;
    this.negotiatedCapabilities = [...selectedCapabilities];

    const initMessage = this.sendMessage(
      "overlay:init",
      {
        selectedVersion: negotiatedVersion,
        parentOrigin: this.parentOrigin,
        overlayToken: this.handshakeOptions.overlayToken,
        overlayTokenExpiresAt: this.handshakeOptions.overlayTokenExpiresAt,
        selectedCapabilities,
        context: this.handshakeOptions.context,
        uiConfig: this.handshakeOptions.uiConfig,
        consent: this.handshakeOptions.consent,
      },
      {
        criticalOnFailure: true,
        ...withOptional({}, "dispatch", options?.dispatch),
        overlayInstanceId: helloMessage.payload.overlayInstanceId,
      },
    );

    this.handshake = {
      initMessageId: initMessage.messageId,
      retries: 0,
    };
    this.scheduleReadyTimeout();

    return initMessage;
  }

  public terminate(reason = "manual_teardown"): void {
    this.clearHelloTimeout();
    this.clearHandshakeTimer();
    for (const pendingAck of this.pendingAcks.values()) {
      if (pendingAck.timerId) {
        this.dependencies.clearTimeout(pendingAck.timerId);
      }
    }
    this.pendingAcks.clear();
    this.emitDiagnostic("BRG_IFRAME_UNAVAILABLE", `Bridge terminated: ${reason}`);
    this.transitionTo("TERMINATED");
  }

  private recordDecision(
    message: AnyBridgeMessage,
    decision: MessageDecisionRecord,
  ): BridgeReceiveResult {
    this.messageDecisions.set(message.messageId, decision);
    return {
      accepted: decision.accepted,
      duplicate: false,
      message,
      ...withOptional({}, "response", decision.response),
      ...withOptional({}, "reason", decision.reason),
    };
  }

  private validateSemanticState(message: AnyBridgeMessage): SemanticValidationFailure | null {
    if (message.sessionId !== this.sessionId) {
      return {
        reason: "message sessionId does not match the active bridge session",
        fatal: true,
      };
    }

    if (message.bridgeInstanceId !== this.bridgeInstanceId) {
      return {
        reason: "message bridgeInstanceId does not match the active bridge instance",
        fatal: true,
      };
    }

    if (message.type === "overlay:hello") {
      if (this.state !== "HANDSHAKE_PENDING" && this.state !== "DEGRADED") {
        return {
          reason: `overlay:hello is not allowed while bridge state is ${this.state}`,
          fatal: false,
        };
      }

      if (this.overlayInstanceId && message.payload.overlayInstanceId !== this.overlayInstanceId) {
        return {
          reason: "overlay:hello overlayInstanceId does not match the active overlay",
          fatal: true,
        };
      }
    }

    if (
      this.overlayInstanceId &&
      message.type !== "overlay:hello" &&
      message.type !== "bridge:ack" &&
      message.type !== "bridge:nack" &&
      message.overlayInstanceId !== this.overlayInstanceId
    ) {
      return {
        reason: "message overlayInstanceId does not match the active overlay",
        fatal: true,
      };
    }

    if (message.type === "overlay:ready") {
      if (!this.handshake || this.state !== "HANDSHAKE_PENDING") {
        return {
          reason: "overlay:ready received before overlay:init handshake",
          fatal: false,
        };
      }

      if (this.overlayInstanceId && message.payload.overlayInstanceId !== this.overlayInstanceId) {
        return {
          reason: "overlay:ready overlayInstanceId does not match handshake overlay",
          fatal: true,
        };
      }
    }

    return null;
  }

  private trackIncomingSequence(message: AnyBridgeMessage): void {
    const senderKey =
      message.type === "overlay:hello"
        ? message.payload.overlayInstanceId
        : (message.overlayInstanceId ?? this.overlayInstanceId ?? "overlay:pre-hello");
    const previous = this.lastSequenceBySender.get(senderKey);

    if (previous !== undefined && message.sequence <= previous) {
      this.emitDiagnostic("BRG_SEQUENCE_OUT_OF_ORDER", "Incoming sequence is not monotonic", {
        senderKey,
        previousSequence: previous,
        receivedSequence: message.sequence,
        messageId: message.messageId,
      });
      return;
    }

    this.lastSequenceBySender.set(senderKey, message.sequence);
  }

  private transitionTo(state: OverlayBridgeSnapshot["state"]): void {
    this.state = state;
    const snapshot = this.getSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(snapshot);
    }
  }

  private emitDiagnostic(
    code: BridgeRuntimeDiagnostic["code"],
    message: string,
    details?: Record<string, unknown>,
  ): void {
    this.diagnostics.push(
      withOptional(
        {
          code,
          message,
          state: this.state,
          timestampMs: this.dependencies.now(),
        },
        "details",
        details,
      ) as BridgeRuntimeDiagnostic,
    );
  }

  private scheduleHelloTimeout(): void {
    this.clearHelloTimeout();
    this.helloTimerId = this.dependencies.setTimeout(() => {
      this.emitDiagnostic("BRG_IFRAME_UNAVAILABLE", "overlay:hello timed out");
      this.transitionTo("DEGRADED");
    }, this.helloTimeoutMs);
  }

  private clearHelloTimeout(): void {
    if (this.helloTimerId) {
      this.dependencies.clearTimeout(this.helloTimerId);
      delete this.helloTimerId;
    }
  }

  private scheduleReadyTimeout(): void {
    this.clearHandshakeTimer();
    this.handshake!.timerId = this.dependencies.setTimeout(() => {
      if (!this.handshake) {
        return;
      }

      const pendingInit = this.pendingAcks.get(this.handshake.initMessageId);
      if (!pendingInit || !pendingInit.dispatch) {
        this.emitDiagnostic(
          "BRG_ACK_TIMEOUT",
          "overlay:init ready timeout without dispatch transport",
        );
        this.transitionTo("DEGRADED");
        return;
      }

      if (this.handshake.retries >= this.retryPolicy.maxRetries) {
        this.emitDiagnostic("BRG_ACK_TIMEOUT", "overlay:ready timed out after retries");
        this.transitionTo("DEGRADED");
        return;
      }

      this.handshake.retries += 1;
      pendingInit.dispatch(pendingInit.envelope);
      this.scheduleReadyTimeout();
    }, this.readyTimeoutMs);
  }

  private clearHandshakeTimer(): void {
    if (this.handshake?.timerId) {
      this.dependencies.clearTimeout(this.handshake.timerId);
      delete this.handshake.timerId;
    }
  }

  private trackPendingAck(
    envelope: AnyBridgeMessage,
    options: Pick<PendingAckEntry, "dispatch" | "criticalOnFailure" | "suppressTimeoutRetries">,
  ): void {
    const entry: PendingAckEntry = {
      envelope,
      retries: 0,
      criticalOnFailure: options.criticalOnFailure,
      suppressTimeoutRetries: options.suppressTimeoutRetries,
      ...withOptional({}, "dispatch", options.dispatch),
    };
    this.pendingAcks.set(envelope.messageId, entry);

    if (!entry.suppressTimeoutRetries) {
      this.scheduleAckTimeout(envelope.messageId);
    }
  }

  private scheduleAckTimeout(messageId: string): void {
    const entry = this.pendingAcks.get(messageId);
    if (!entry) {
      return;
    }

    entry.timerId = this.dependencies.setTimeout(() => {
      const current = this.pendingAcks.get(messageId);
      if (!current) {
        return;
      }

      if (current.retries >= this.retryPolicy.maxRetries || !current.dispatch) {
        this.pendingAcks.delete(messageId);
        this.emitDiagnostic("BRG_ACK_TIMEOUT", `Ack timeout for ${current.envelope.type}`, {
          messageId,
        });
        if (current.criticalOnFailure) {
          this.transitionTo("DEGRADED");
        }
        return;
      }

      current.retries += 1;
      current.dispatch(current.envelope);
      this.scheduleAckTimeout(messageId);
    }, this.resolveBackoffDelay(entry.retries));
  }

  private resolveBackoffDelay(retryCount: number): number {
    return this.retryPolicy.backoffMs[retryCount] ?? this.retryPolicy.ackTimeoutMs;
  }

  private resolvePendingAck(messageId: string): void {
    const entry = this.pendingAcks.get(messageId);
    if (!entry) {
      return;
    }

    if (entry.timerId) {
      this.dependencies.clearTimeout(entry.timerId);
    }

    this.pendingAcks.delete(messageId);
  }

  private handleNack(messageId: string, retryable: boolean): void {
    const entry = this.pendingAcks.get(messageId);
    if (!entry) {
      return;
    }

    if (!retryable || !entry.dispatch || entry.retries >= this.retryPolicy.maxRetries) {
      this.resolvePendingAck(messageId);
      if (entry.criticalOnFailure) {
        this.transitionTo("DEGRADED");
      }
      return;
    }

    entry.retries += 1;
    entry.dispatch(entry.envelope);
    if (!entry.suppressTimeoutRetries) {
      this.scheduleAckTimeout(messageId);
    }
  }

  private createAckMessage(
    correlationId: string,
    overlayInstanceId?: string,
  ): BridgeMessage<"bridge:ack"> {
    return createBridgeMessageEnvelope({
      type: "bridge:ack" as const,
      payload: { ackMessageId: correlationId, status: "ok" },
      sessionId: this.sessionId,
      bridgeInstanceId: this.bridgeInstanceId,
      messageId: this.dependencies.generateId(),
      sequence: ++this.sequence,
      sentAtMs: this.dependencies.now(),
      ...withOptional({}, "overlayInstanceId", overlayInstanceId),
      correlationId,
    });
  }

  private createNackMessage(
    correlationId: string,
    reason: string,
    sourceType: BridgeMessageType,
  ): BridgeMessage<"bridge:nack"> {
    return createBridgeMessageEnvelope({
      type: "bridge:nack" as const,
      payload: {
        ackMessageId: correlationId,
        status: "rejected",
        code: "BRG_COMMAND_NOT_ALLOWED",
        message: reason,
        retryable: sourceType === "overlay:ready",
      },
      sessionId: this.sessionId,
      bridgeInstanceId: this.bridgeInstanceId,
      messageId: this.dependencies.generateId(),
      sequence: ++this.sequence,
      sentAtMs: this.dependencies.now(),
      ...withOptional({}, "overlayInstanceId", this.overlayInstanceId),
      correlationId,
    });
  }
}
