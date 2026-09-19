# CKEFA Media booking refactor validation

Validated in the ChatGPT Linux build environment on 14 September 2026.

## Passed

- `node --test tests/refactor-smoke.test.mjs` — 5/5 tests passed.
- `node node_modules/typescript/bin/tsc --noEmit` — passed with zero TypeScript errors.
- Incremental migration present: `supabase/migrations/202609140002_booking_refactor_manual_payments.sql`.
- Local `.env.local` files and `node_modules` are intentionally excluded from this deliverable.

## Production bundling note

The retained source archive contained Windows-native Rollup/esbuild optional binaries. The Linux sandbox could not execute Vite's production bundle because `@rollup/rollup-linux-x64-gnu` was absent, and this sandbox cannot access the npm registry to install the matching native optional package. This is an environment/dependency-platform limitation rather than a TypeScript/application error.

Run the normal clean build on the deployment/Windows environment:

```bash
npm ci
npm test
npm run test:refactor
npm run build
```

Do not deploy any older `dist` directory from a previous build; deploy the newly generated `dist` after the incremental migration has been applied and payment settings configured.
