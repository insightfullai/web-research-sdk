# Insightfull Web Research SDK

Choose the shortest path that matches your application:

| Stack                                          | Start here                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| First production integration                   | [Ship your first in-product interview](quickstart/first-interview.md)          |
| Vanilla TypeScript, Vite, or another framework | [Installation and setup](quickstart/installation.md)                           |
| React or React Router                          | [React integration](quickstart/react-integration.md)                           |
| Next.js App Router                             | [Next.js integration](quickstart/nextjs.md)                                    |
| Existing design system or custom iframe host   | [Customize the interview experience](guides/customize-interview-experience.md) |

## Build a verified integration

1. Create a development environment and allowed hostname.
2. Initialize the SDK and verify `ready()`.
3. Identify the participant with non-sensitive attributes.
4. Track one stable product event.
5. Prove targeting with the side-effect-free `explainDelivery()` API.
6. Preview the study in the real application.
7. Verify minimize, resume, dismissal, logout reset, and responsive behavior.
8. Promote the same integration to a separate production environment ID.

## Reference

- [SDK API](reference/sdk-api.md)
- [Explain and debug delivery](guides/delivery-diagnostics.md)
- [Explicit host context](../packages/core/README.md#explicit-host-context)
- [Local packed-package validation](quickstart/local-integration-runbook.md)
- [Troubleshooting and launch diagnostics](guides/troubleshooting.md)
- [Recorder package](../packages/recorder/README.md)
- [Release-artifact integration lab](../packages/test-app-react)

## Supported presentation levels

- **Default:** dependency-free corner panel with safe responsive constraints.
- **Configured:** placement, dimensions, offset, radius, brand color, and minimized copy.
- **Custom:** host-owned container and iframe with verified bridge registration, shared display state, and deterministic cleanup.

Customization never requires selectors into private iframe DOM.
