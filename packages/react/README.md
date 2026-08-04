# @insightfull/web-research-sdk-react

Optional React integration package for the Insightfull Web Research SDK.

- install: `yarn add @insightfull/web-research-sdk @insightfull/web-research-sdk-react`
- docs: `https://github.com/insightfullai/web-research-sdk/blob/main/docs/quickstart/react-integration.md`

This package adds provider/hooks/iframe helpers on top of `@insightfull/web-research-sdk` and does not include proprietary overlay logic.

The provider is SSR-safe, destroys its SDK instance on unmount, and reinitializes on meaningful Client ID or option changes.

- [React integration](../../docs/quickstart/react-integration.md)
- [Customize the interview experience](../../docs/guides/customize-interview-experience.md)
