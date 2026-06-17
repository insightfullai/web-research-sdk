/**
 * SDK configuration types — mirrors the response from GET /trpc/sdk.getConfig
 */

/** A single trigger definition within a study. */
export interface StudyTrigger {
	eventName: string;
	filters: TriggerFilter[];
	isActive: boolean;
	/** How this trigger is matched: "event" (default) matches by event name, "url" matches the URL pattern on pageview events. */
	matchOn?: "event" | "url";
	priority: number;
}

/** A filter predicate evaluated against user attributes or custom IDs. */
export interface TriggerFilter {
	operator: "equals" | "exists";
	property: string;
	value?: unknown;
}

/** Branding information for study display. */
export interface StudyBranding {
	logoUrl: string | null;
	organizationName: string;
	theme: string | null;
}

/** A study section returned in config. */
export interface StudySection {
	config: unknown;
	id: number;
	position: number;
	title: string | null;
	type: string;
}

/** Full study content returned in the SDK config response. */
export interface StudyContent {
	branding: StudyBranding;
	experienceMode: string;
	id: number;
	sections: StudySection[];
	shareUrl: string | null;
	title: string | null;
	triggers: StudyTrigger[];
	type: string;
}

/** Global SDK settings from the config response. */
export interface GlobalSettings {
	cooldownDays: number;
	sessionTimeoutMs: number;
}

/** SDK environment details from the config response. */
export interface SdkEnvironment {
	allowedDomains: string[] | null;
	clientId: string;
	isActive: boolean;
	name: string;
}

/** Full config response from the SDK config endpoint. */
export interface SdkConfig {
	environment: SdkEnvironment;
	globalSettings: GlobalSettings;
	studies: StudyContent[];
}
