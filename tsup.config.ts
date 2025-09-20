import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts", "src/test/runTest.ts", "src/test/suite/**/*.ts"],
  outDir: "out",
  format: ["cjs"],
  platform: "node",
  target: "node16",
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
  minify: false,
  shims: false,
  skipNodeModulesBundle: true,
  external: [
    "vscode",
    // Node builtins are treated as external by default, this is explicit
    "fs",
    "path",
    "os",
    "util",
    "assert",
    "module",
  ],
});
