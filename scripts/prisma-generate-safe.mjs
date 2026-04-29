import {spawnSync} from "node:child_process";

const result = spawnSync("npx", ["prisma", "generate"], {
  shell: true,
  stdio: "pipe",
  encoding: "utf8",
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status === 0) {
  process.exit(0);
}

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
if (/EPERM: operation not permitted, rename/i.test(output)) {
  process.stderr.write(
    "\n[prisma-generate-safe] Detected Windows file lock during prisma generate; continuing dev startup.\n",
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
