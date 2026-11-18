# VAIRA

Women's-safety app. pnpm monorepo.

## Structure

- `packages/core` — pure-TypeScript shared logic (`@vaira/core`)
- `apps/api` — Next.js API (added by a later task)
- `apps/mobile` — Expo Android app (added by a later task)

## Commands

- `pnpm install` — install all workspace dependencies
- `pnpm test` — run every package's test script
- `pnpm typecheck` — typecheck every package

## Conventions

- Never read a native-module enum off its namespace object (e.g. `Skia.ImageFormat.JPEG`,
  `ImageManipulator.SaveFormat.JPEG`, `Skia.ClipOp.Intersect`). These enums are top-level
  exports and are `undefined` on the Hermes runtime, so the read throws and silently kills
  the frame pipeline. Import the enum from the package top level, or pass the verified
  numeric literal with a comment naming the enum. Enforced by `nativeEnumGuard.test.ts`.
