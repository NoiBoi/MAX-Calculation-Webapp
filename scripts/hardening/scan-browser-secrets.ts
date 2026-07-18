import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), ".next", "static");
const forbiddenNames = ["SUPABASE_SERVICE_ROLE_KEY", "service_role"];
const configuredSecret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]));
  return nested.flat();
}

const findings: string[] = [];
for (const path of await files(root)) {
  if (!/\.(?:js|css|map)$/.test(path)) continue;
  const contents = await readFile(path, "utf8");
  for (const marker of forbiddenNames) if (contents.includes(marker)) findings.push(`${path}: forbidden marker ${marker}`);
  if (configuredSecret && contents.includes(configuredSecret)) findings.push(`${path}: configured service-role value`);
}
if (findings.length) {
  process.stderr.write(`Browser bundle secret scan failed:\n${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Browser bundle secret scan passed: no service-role marker or configured value found.\n");
}
