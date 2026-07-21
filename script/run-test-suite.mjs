#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const toRepoRelative = (absolutePath) => path.relative(repoRoot, absolutePath).split(path.sep).join("/");

export function discoverSpecFiles(directories, options = {}) {
  const root = path.resolve(options.root ?? repoRoot);
  const results = [];
  const visit = (absoluteDir) => {
    const entries = readdirSync(absoluteDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
        results.push(path.relative(root, absolutePath).split(path.sep).join("/"));
      }
    }
  };

  for (const directory of directories) {
    const absoluteDir = path.resolve(root, directory);
    if (!existsSync(absoluteDir) || !statSync(absoluteDir).isDirectory()) {
      throw new Error(`Test directory not found: ${directory}`);
    }
    visit(absoluteDir);
  }
  return [...new Set(results)].sort((a, b) => a.localeCompare(b));
}

const mainUrl = pathToFileURL(process.argv[1]).href;
if (import.meta.url === mainUrl) {
  const args = process.argv.slice(2);
  const listOnly = args[0] === "--list";
  const directories = listOnly ? args.slice(1) : args;
  if (directories.length === 0) {
    console.error("Usage: node script/run-test-suite.mjs [--list] <dir> [dir...]");
    process.exit(2);
  }

  let testFiles;
  try {
    testFiles = discoverSpecFiles(directories);
  } catch (error) {
    console.error((error && error.message) || String(error));
    process.exit(2);
  }

  if (testFiles.length === 0) {
    console.error(`No .spec.ts tests found under: ${directories.join(", ")}`);
    process.exit(1);
  }

  if (listOnly) {
    process.stdout.write(`${testFiles.join("\n")}\n`);
    process.exit(0);
  }

  const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
  if (!existsSync(tsxCli)) {
    console.error(`Local tsx CLI not found: ${toRepoRelative(tsxCli)}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [tsxCli, "--test", ...testFiles], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to launch tsx test runner: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
