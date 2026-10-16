import { resolve } from "node:path";

// Loads a module from apps/server/src so tests can compare the client's
// copies of server constants with the originals. Only modules without
// runtime imports of server-only packages can be loaded this way.
//
// The path is built from import.meta.dirname: Vite rewrites
// `new URL(path, import.meta.url)` into a dev-server URL.
export async function loadServerModule<T = Record<string, unknown>>(
  pathFromServerSrc: string,
): Promise<T> {
  const file = resolve(
    import.meta.dirname,
    "../../../../server/src",
    pathFromServerSrc,
  );
  return (await import(/* @vite-ignore */ file)) as T;
}
