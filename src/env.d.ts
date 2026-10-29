/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Repository link shown in the header (set by the Pages workflow). */
  readonly VITE_REPO_URL?: string;
}

declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: () => unknown;
  export default factory;
}
