import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack doesn't pick up an
  // unrelated lockfile higher in the directory tree (C:\Users\HP\...).
  // process.cwd() is the project dir when run via the npm scripts.
  turbopack: {
    root: process.cwd(),
  },
  // Transpile the Yjs / Tiptap-collaboration ESM packages through Next's own
  // pipeline so they bundle/evaluate correctly (fixes the lib0 "Unexpected end
  // of array" module-evaluation error under Turbopack).
  transpilePackages: [
    "yjs",
    "lib0",
    "y-protocols",
    "y-prosemirror",
    "y-indexeddb",
    "y-websocket",
    "@tiptap/y-tiptap",
  ],
};

export default nextConfig;
