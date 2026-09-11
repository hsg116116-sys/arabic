---
name: Generated client TypeScript libs
description: A compiler-library requirement for the generated React API client.
---

The generated Orval client uses `Headers.entries()`, so the API client package must include `dom.iterable` alongside `dom` in its TypeScript `lib` list.

**Why:** The generated client can be valid at runtime but fail the workspace library typecheck when `Headers.entries()` is not included in the DOM typings.

**How to apply:** If API codegen starts failing on `Headers.entries`, check the `lib/api-client-react` compiler `lib` setting before changing generated output.