---
name: Generated client TypeScript
description: TypeScript library settings required by the generated React API client.
---

The generated React API client uses `Headers.entries()` while normalizing response headers, so the client library TypeScript config must include both `dom` and `dom.iterable` in its `lib` list.

**Why:** Without `dom.iterable`, the API codegen pipeline completes but the workspace library typecheck fails on the generated client.

**How to apply:** Preserve `dom.iterable` in `lib/api-client-react/tsconfig.json` when regenerating the client.