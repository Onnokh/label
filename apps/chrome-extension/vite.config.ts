import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export default defineConfig({
  base: "",
  root: "src",
  build: {
    outDir: join(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: join(__dirname, "src/background.ts"),
        options: join(__dirname, "src/options.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
        manualChunks: undefined,
      },
    },
  },
  plugins: [
    {
      name: "copy-manifest-and-icons",
      closeBundle() {
        const distDir = join(__dirname, "dist");
        if (!existsSync(join(distDir, "icons"))) {
          mkdirSync(join(distDir, "icons"), { recursive: true });
        }
        copyFileSync(
          join(__dirname, "public/manifest.json"),
          join(distDir, "manifest.json"),
        );
        for (const size of [16, 32, 48, 128]) {
          copyFileSync(
            join(__dirname, `public/icons/icon-${size}.png`),
            join(distDir, `icons/icon-${size}.png`),
          );
        }
      },
    },
  ],
});