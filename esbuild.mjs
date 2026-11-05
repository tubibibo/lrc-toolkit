import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** Bundling options for the VS Code extension host (CommonJS, Node >= 20). */
const buildOptions = {
  entryPoints: ["src/vscode-host/extension.ts"],
  bundle: true,
  outdir: "dist",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: false,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("[esbuild] watching for changes…");
} else {
  await esbuild.build(buildOptions);
}
