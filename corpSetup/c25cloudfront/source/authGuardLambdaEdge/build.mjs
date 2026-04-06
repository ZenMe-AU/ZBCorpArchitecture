import { execSync } from "child_process";
import { copyFileSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";

const root = process.cwd();
const distDir = resolve(root, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

copyFileSync(resolve(root, "index.mjs"), resolve(distDir, "index.mjs"));
copyFileSync(resolve(root, "package.json"), resolve(distDir, "package.json"));

execSync("npm install --omit=dev --no-audit --no-fund", {
  cwd: distDir,
  stdio: "inherit",
  shell: true,
});

rmSync(resolve(distDir, "package.json"), { force: true });
rmSync(resolve(distDir, "package-lock.json"), { force: true });

console.log("Prepared Lambda package in dist/");
