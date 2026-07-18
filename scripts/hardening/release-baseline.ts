import { releaseBaseline } from "../../lib/release/baseline";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function localCommit(): Promise<string | undefined> {
  try {
    const head = (await readFile(join(process.cwd(), ".git", "HEAD"), "utf8")).trim();
    if (!head.startsWith("ref: ")) return head;
    return (await readFile(join(process.cwd(), ".git", head.slice(5)), "utf8")).trim();
  } catch {
    return undefined;
  }
}

const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? await localCommit();
process.stdout.write(`${JSON.stringify({
  ...releaseBaseline({ ...process.env, ...(gitCommit ? { GIT_COMMIT: gitCommit } : {}) }),
  testExecutionDate: new Date().toISOString(),
  testTarget: process.env.TEST_TARGET ?? "local",
}, null, 2)}\n`);
