#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { execSync } from "node:child_process";

import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PATH_EXTS = /\.(js|jsx|ts|tsx|mjs|cjs|md|json|jsonc|ya?ml|sh|py|toml|css|html)$/;
const ENV_RE = /^[A-Z][A-Z0-9_]{3,}$/;
const BASES = ["", "catalog/", "cli/", "gateway/", "scripts/", "docs/", "web/"];

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function loadAllowlist() {
  const f = join(ROOT, "docs", ".doccheck-allow");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function loadScripts() {
  const names = new Set();
  for (const base of ["", "scripts/", "cli/", "gateway/", "web/"]) {
    const f = join(ROOT, base, "package.json");
    if (!existsSync(f)) continue;
    const pkg = JSON.parse(readFileSync(f, "utf8"));
    for (const s of Object.keys(pkg.scripts ?? {})) names.add(s);
  }
  return names;
}

function loadCliSource() {
  const dir = join(ROOT, "cli", "src");
  if (!existsSync(dir)) return "";
  return walk(dir, ".ts")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

function loadBinName() {
  const f = join(ROOT, "cli", "package.json");
  if (!existsSync(f)) return null;
  const bin = JSON.parse(readFileSync(f, "utf8")).bin;
  return bin ? Object.keys(bin)[0] : null;
}

function isCheckablePath(s) {
  if (/\s/.test(s)) return false;
  if (!s.includes("/")) return false;
  if (!PATH_EXTS.test(s)) return false;
  if (/[<>&~%*{}]/.test(s)) return false;
  if (/^(https?:|mailto:|\/)/.test(s)) return false;
  return true;
}

const ROOTED_PREFIXES = ["catalog/", "cli/", "docs/", "gateway/", "schemas/", "web/", ".github/"];

function checkPath(claim, docDir, inCatalog) {
  const clean = claim.replace(/^\.\//, "");
  if (existsSync(join(docDir, clean))) return "ok";
  const rooted =
    ROOTED_PREFIXES.some((p) => clean.startsWith(p)) ||
    (!inCatalog && clean.startsWith("scripts/"));
  if (inCatalog && !rooted) return "skip";
  return BASES.some((b) => existsSync(join(ROOT, b + clean))) ? "ok" : "broken";
}

function grepRepo(term) {
  try {
    execSync(
      `grep -rIl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude='*.md' ${JSON.stringify(term)} ${JSON.stringify(ROOT)}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return true;
  } catch {
    return false;
  }
}

const allow = loadAllowlist();
const allowed = (claim) => allow.some((p) => claim.includes(p));
const npmScripts = loadScripts();
const cliSource = loadCliSource();
const binName = loadBinName();

const mdFiles = [
  join(ROOT, "README.md"),
  join(ROOT, "AGENTS.md"),
  ...walk(join(ROOT, "docs"), ".md"),
  ...walk(join(ROOT, "catalog"), ".md"),
  ...walk(join(ROOT, "cli"), ".md"),
  ...walk(join(ROOT, "gateway"), ".md"),
].filter((f, i, a) => existsSync(f) && a.indexOf(f) === i);

const brokenPaths = [];
const brokenScripts = [];
const brokenCli = [];
const envVars = new Map();
let checked = { paths: 0, scripts: 0, cli: 0, env: 0, skipped: 0 };

for (const file of mdFiles) {
  const rel = relative(ROOT, file);
  const docDir = dirname(file);
  const firstParty = !rel.startsWith("catalog/");
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const ln = i + 1;
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const claim = m[1].trim();
      if (isCheckablePath(claim) && !allowed(claim)) {
        const verdict = checkPath(claim, docDir, !firstParty);
        if (verdict === "broken") brokenPaths.push({ rel, ln, claim });
        else if (verdict === "ok") checked.paths++;
        else checked.skipped++;
      } else if (ENV_RE.test(claim) && !/^[A-F0-9]{6}$/.test(claim) && !allowed(claim)) {
        if (!envVars.has(claim)) envVars.set(claim, `${rel}:${ln}`);
      }
    }
    if (!firstParty) return;
    for (const m of line.matchAll(/\b(?:npm|pnpm|yarn)\s+(?:--filter\s+\S+\s+)?run\s+([a-z][a-z0-9:_-]*)/gi)) {
      const name = m[1];
      if (allowed(name)) continue;
      checked.scripts++;
      if (!npmScripts.has(name)) brokenScripts.push({ rel, ln, claim: name });
    }
    if (binName) {
      const cliRe = new RegExp(`(?:^|[^\\w/-])${binName}\\s+([a-z][a-z0-9-]*)`, "g");
      for (const m of line.matchAll(cliRe)) {
        const sub = m[1];
        if (allowed(sub) || sub.startsWith("-")) continue;
        checked.cli++;
        if (!cliSource.includes(`"${sub}"`) && !cliSource.includes(`'${sub}'`)) {
          brokenCli.push({ rel, ln, claim: `${binName} ${sub}` });
        }
      }
    }
  });
}

const missingEnv = [...envVars].filter(([v]) => !grepRepo(v));
checked.env = envVars.size;

function report(title, items) {
  if (!items.length) return;
  console.log(`\n${title} (${items.length}):`);
  for (const b of items) console.log(`  ${b.rel}:${b.ln}  ${b.claim}`);
}

console.log(`Scanned ${mdFiles.length} markdown files.`);
console.log(
  `Checked: ${checked.paths} file paths, ${checked.scripts} npm scripts, ${checked.cli} CLI invocations, ${checked.env} env vars (skipped ${checked.skipped} external refs in vendored catalog docs).`,
);
report("BROKEN file-path claims", brokenPaths);
report("BROKEN npm-script claims", brokenScripts);
report("BROKEN CLI subcommand claims", brokenCli);
if (missingEnv.length) {
  console.log(`\nEnv vars not found in code (report-only, ${missingEnv.length}):`);
  for (const [v, loc] of missingEnv) console.log(`  ${v}  (first seen ${loc})`);
}
const failures = brokenPaths.length + brokenScripts.length + brokenCli.length;
console.log(
  failures
    ? `\nFAIL: ${failures} broken high-confidence claim(s). Fix the docs or add a line to docs/.doccheck-allow.`
    : "\nOK: no broken file-path, npm-script, or CLI claims.",
);
process.exit(failures ? 1 : 0);
