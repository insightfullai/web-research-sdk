# @insightfull/web-research-sdk-recorder

Experimental rrweb recorder package for `@insightfull/web-research-sdk`.

- install: `yarn add @insightfull/web-research-sdk @insightfull/web-research-sdk-recorder`
- import: `attachInsightfullRecorder(sdk, options)`

This package intentionally keeps `rrweb` outside the core SDK package. It records only after the SDK iframe bridge is active and ready, uses conservative privacy defaults (`maskAllInputs` and `maskAllText`), and exposes stub uploader hooks for future backend integration.
