# Migration: ContextHub Core Extraction

## What changed

Three pure-TS modules were extracted from `apps/main/src/features/contextHub/domain/` into this shared package:

| Module | App path | Shared subpath export |
|--------|----------|-----------------------|
| Descriptor Registry | `domain/descriptorRegistry.ts` | `@pixsim7/shared.capabilities.core/descriptor` |
| Contract Registry | `domain/contracts/index.ts` | `@pixsim7/shared.capabilities.core/contract` |
| App Bridge Utils | `domain/appCapabilityBridge.ts` | `@pixsim7/shared.capabilities.core/bridge` |

## Impact on existing code

**Zero breaking changes.** The original app files now re-export from this shared package. All existing imports in the app continue to work unchanged.

## For new code

Prefer importing directly from the shared package:

```ts
import { registerCapabilityDescriptor } from "@pixsim7/shared.capabilities.core/descriptor";
import { registerCapabilityContract } from "@pixsim7/shared.capabilities.core/contract";
import { getAppActionCapabilityKey } from "@pixsim7/shared.capabilities.core/bridge";
```

The top-level export also works:

```ts
import { registerCapabilityDescriptor, Descriptor } from "@pixsim7/shared.capabilities.core";
```
