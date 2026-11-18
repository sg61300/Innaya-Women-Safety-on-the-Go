// Narrow ambient declaration for the one server API used in tests
// (Phone.guardian.test.tsx). react-dom 19 ships no bundled types and
// @types/react-dom is not installed in this workspace, so tsc raised TS7016 on
// `import { renderToStaticMarkup } from "react-dom/server"`. This declares only
// what the test imports; when @types/react-dom is added later it supersedes this.
declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(node: ReactNode): string;
  export function renderToString(node: ReactNode): string;
}
