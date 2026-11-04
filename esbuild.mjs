import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** Bundling options for the VS Code extension host (CommonJS, Node >= 18). */
const buildOptions = {
  entryPoints: ["src/vscode-host/extension.ts"],
  bundle: true,
  outdir: "dist",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
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
