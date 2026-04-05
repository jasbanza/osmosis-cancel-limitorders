const esbuild = require("esbuild");
const path = require("path");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "src", "index.js")],
    bundle: true,
    outfile: path.join(__dirname, "..", "docs", "bundle.js"),
    format: "iife",
    platform: "browser",
    target: "es2020",
    define: {
      global: "globalThis",
      "process.env.NODE_ENV": '"production"',
      "process.env.NODE_DEBUG": "false",
    },
    external: ["crypto"],
    minify: true,
    sourcemap: false,
    logLevel: "info",
  })
  .catch(() => process.exit(1));
