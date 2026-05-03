import {spawnSync, execSync} from "node:child_process";

function sleepSync(ms) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Start-Sleep -Seconds ${sec}"`, {stdio: "ignore"});
    } else {
      execSync(`sleep ${sec}`, {stdio: "ignore"});
    }
  } catch {
    /* ignore */
  }
}

let lastOutput = "";
let lastStatus = 1;

for (let attempt = 1; attempt <= 6; attempt++) {
  const result = spawnSync("npx", ["prisma", "generate"], {
    shell: true,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  lastOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
  lastStatus = result.status ?? 1;

  if (lastStatus === 0) {
    process.exit(0);
  }

  const eperm = /EPERM: operation not permitted, rename/i.test(lastOutput);
  if (eperm && attempt < 6) {
    process.stderr.write(
      `\n[prisma-generate-safe] Windows file lock (attempt ${attempt}/6); retrying in 800ms… Stop duplicate dev servers if this keeps repeating.\n`,
    );
    sleepSync(800);
    continue;
  }

  break;
}

if (/EPERM: operation not permitted, rename/i.test(lastOutput)) {
  process.stderr.write(
    "\n[prisma-generate-safe] prisma generate failed after retries (DLL still locked).\n",
  );
  process.stderr.write(
    "→ Stop `npm run dev` / Shopify dev, run `npx prisma generate`, restart dev. Otherwise Prisma throws “Unknown argument” for new schema fields.\n",
  );
  process.exit(0);
}

process.exit(lastStatus);
