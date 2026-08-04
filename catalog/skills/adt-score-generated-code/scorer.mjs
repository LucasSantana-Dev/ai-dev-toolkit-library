#!/usr/bin/env node
// scorer.mjs — deterministic scorer for AI-generated code. Zero dependencies.
// Ported from forge-space/core patterns/idp/scorecards/post-gen-scorer.ts (343 lines).
// Usage: node scorer.mjs <file> [--framework react] [--no-typescript] [--min-score 60] [--json]

import { readFileSync } from "node:fs";

const ANTI_PATTERNS = [
  { pattern: /console\.(log|debug|info)\(/g, name: "no-console", msg: "Remove console statements" },
  { pattern: /\/\/\s*TODO/gi, name: "no-todo", msg: "Resolve TODO comments before shipping" },
  { pattern: /\/\/\s*FIXME/gi, name: "no-fixme", msg: "Resolve FIXME comments before shipping" },
  { pattern: /style\s*=\s*\{\{/g, name: "no-inline-styles", msg: "Avoid inline styles, use CSS classes" },
  { pattern: /!important/g, name: "no-important", msg: "Avoid !important in CSS" },
];

const REACT_CHECKS = [
  { pattern: /onClick\s*=\s*\{[^}]*\}/, positive: true, name: "event-handlers", msg: "Uses proper event handlers" },
  { pattern: /aria-|role=/, positive: true, name: "accessibility", msg: "Includes accessibility attributes" },
  { pattern: /key\s*=\s*\{/, positive: true, name: "list-keys", msg: "Uses key prop in lists" },
  { pattern: /dangerouslySet/, positive: false, name: "no-unsafe-html", msg: "Avoid unsafe HTML injection" },
];

const gradeFromScore = (s) => (s >= 90 ? "A" : s >= 75 ? "B" : s >= 60 ? "C" : s >= 40 ? "D" : "F");

function checkAntiPatterns(code) {
  return ANTI_PATTERNS.map(({ pattern, name, msg }) => {
    const matches = code.match(pattern);
    return { name, passed: !matches, message: matches ? `${msg} (${matches.length} found)` : msg, weight: 10 };
  });
}

function checkStructure(code) {
  const checks = [];
  const lines = code.split("\n");
  const hasExport = /export\s+(default\s+)?(function|class|const|interface|type)\b/.test(code);
  checks.push({ name: "has-export", passed: hasExport, message: hasExport ? "Has proper exports" : "Missing exports", weight: 15 });
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const longLines = maxLineLength <= 100;
  checks.push({ name: "line-length", passed: longLines, message: longLines ? "Lines within 100 chars" : `Longest line: ${maxLineLength} chars`, weight: 5 });
  const totalLines = lines.length;
  const reasonable = totalLines > 0 && totalLines <= 500;
  checks.push({ name: "file-length", passed: reasonable, message: reasonable ? `${totalLines} lines` : `${totalLines} lines (consider splitting)`, weight: 5 });
  const hasErrorHandling = /try\s*\{|\.catch\(|catch\s*\(/.test(code);
  checks.push({ name: "error-handling", passed: hasErrorHandling, message: hasErrorHandling ? "Has error handling" : "Consider adding error handling", weight: 10 });
  return checks;
}

function checkTypeScript(code) {
  const checks = [];
  const hasTypes = /:\s*(string|number|boolean|Record|Array|Promise|void)\b/.test(code) || /interface\s+\w+/.test(code) || /type\s+\w+\s*=/.test(code);
  checks.push({ name: "type-annotations", passed: hasTypes, message: hasTypes ? "Uses TypeScript types" : "Missing type annotations", weight: 15 });
  const hasAny = /:\s*any\b/.test(code);
  checks.push({ name: "no-any", passed: !hasAny, message: hasAny ? "Avoid using `any` type" : "No `any` types", weight: 10 });
  return checks;
}

function checkFramework(code, framework) {
  if (framework !== "react") return [];
  return REACT_CHECKS.map(({ pattern, positive, name, msg }) => ({
    name, passed: positive ? pattern.test(code) : !pattern.test(code), message: msg, weight: 10,
  }));
}

function checkArchitecture(code) {
  const checks = [];
  const lines = code.split("\n");
  const tooLong = lines.length > 300;
  checks.push({ name: "architecture-file-size", passed: !tooLong, message: tooLong ? `File has ${lines.length} lines (max 300)` : "File size within limits", weight: 15 });
  const fnCount = (code.match(/(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\()/g) || []).length;
  checks.push({ name: "architecture-function-count", passed: fnCount <= 10, message: fnCount > 10 ? `${fnCount} functions in one file (max 10)` : `${fnCount} functions`, weight: 10 });
  const propMatch = code.match(/(?:interface|type)\s+\w*[Pp]rops\s*(?:=\s*)?\{([^}]*)}/);
  if (propMatch) {
    const propCount = (propMatch[1] ?? "").split(/[;\n]/).filter((l) => l.trim()).length;
    const tooMany = propCount > 10;
    checks.push({ name: "architecture-prop-count", passed: !tooMany, message: tooMany ? `${propCount} props (max 10, consider splitting)` : `${propCount} props`, weight: 10 });
  }
  return checks;
}

function checkErrorHandling(code) {
  const checks = [];
  const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/.test(code);
  checks.push({ name: "error-handling-empty-catch", passed: !emptyCatch, message: emptyCatch ? "Empty catch block swallows errors" : "No empty catch blocks", weight: 15 });
  const consoleOnlyCatch = /catch\s*\([^)]*\)\s*\{\s*console\.(log|error|warn)\([^)]*\);\s*\}/.test(code);
  checks.push({ name: "error-handling-console-catch", passed: !consoleOnlyCatch, message: consoleOnlyCatch ? "Catch block only logs — consider proper error handling" : "Catch blocks handle errors properly", weight: 10 });
  const unhandledPromise = /\.then\s*\(/.test(code) && !/\.catch\s*\(/.test(code);
  checks.push({ name: "error-handling-unhandled-promise", passed: !unhandledPromise, message: unhandledPromise ? "Promise chain without .catch()" : "Promise chains have error handling", weight: 10 });
  return checks;
}

function checkScalability(code) {
  const checks = [];
  const hasN1 = /for\s*\(.*\)\s*\{[^}]*(fetch|query|select|findOne|findMany)\s*\(/.test(code);
  checks.push({ name: "scalability-n-plus-1", passed: !hasN1, message: hasN1 ? "Possible N+1: data fetching inside loop" : "No N+1 query patterns detected", weight: 15 });
  const hasList = /\.map\s*\(/.test(code);
  const hasPagination = /page|limit|offset|cursor|hasMore|pageSize/i.test(code);
  const missingPagination = hasList && !hasPagination;
  checks.push({ name: "scalability-pagination", passed: !missingPagination, message: missingPagination ? "List rendering without pagination" : "Lists have pagination or are bounded", weight: 10 });
  return checks;
}

function checkHardcodedValues(code) {
  const checks = [];
  const hasHardcodedUrl = /["'`]https?:\/\/(?!localhost|127\.0\.0\.1|example\.com)[^"'`]+["'`]/.test(code);
  checks.push({ name: "hardcoded-urls", passed: !hasHardcodedUrl, message: hasHardcodedUrl ? "Hardcoded URL — use environment variables" : "No hardcoded URLs", weight: 10 });
  const hasSecrets = /(?:password|secret|api_key|apiKey|token)\s*[:=]\s*["'`][^"'`]+["'`]/i.test(code);
  checks.push({ name: "hardcoded-secrets", passed: !hasSecrets, message: hasSecrets ? "Possible hardcoded secret — use environment variables" : "No hardcoded secrets detected", weight: 20 });
  return checks;
}

function checkEngineering(code) {
  const checks = [];
  const tsIgnore = /@ts-ignore|@ts-nocheck/.test(code);
  checks.push({ name: "engineering-ts-ignore", passed: !tsIgnore, message: tsIgnore ? "@ts-ignore/@ts-nocheck suppresses type safety" : "No TypeScript suppressions", weight: 10 });
  const syncIO = /readFileSync|writeFileSync|appendFileSync|mkdirSync|readdirSync/.test(code);
  checks.push({ name: "engineering-sync-io", passed: !syncIO, message: syncIO ? "Synchronous I/O blocks the event loop" : "No synchronous I/O", weight: 10 });
  const indexKey = /key\s*=\s*\{?\s*(?:index|i|idx)\s*\}?/.test(code);
  checks.push({ name: "engineering-index-key", passed: !indexKey, message: indexKey ? "Array index as React key causes rendering bugs" : "No index-as-key anti-pattern", weight: 10 });
  return checks;
}

export function scoreGeneratedCode(code, opts = {}) {
  const checks = [
    ...checkAntiPatterns(code),
    ...checkStructure(code),
    ...checkArchitecture(code),
    ...checkErrorHandling(code),
    ...checkScalability(code),
    ...checkHardcodedValues(code),
    ...checkEngineering(code),
    ...(opts.typescript !== false ? checkTypeScript(code) : []),
    ...(opts.framework ? checkFramework(code, opts.framework) : []),
  ];
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earnedWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const minScore = opts.minScore ?? 60;
  return { score, grade: gradeFromScore(score), checks, passed: score >= minScore, timestamp: new Date().toISOString() };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("scorer.mjs")) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: node scorer.mjs <file> [--framework react] [--no-typescript] [--min-score 60] [--json]");
    process.exit(2);
  }
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const code = readFileSync(file, "utf8");
  const result = scoreGeneratedCode(code, {
    framework: opt("framework"),
    typescript: !args.includes("--no-typescript"),
    minScore: opt("min-score") ? Number(opt("min-score")) : undefined,
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`score: ${result.score}  grade: ${result.grade}  passed: ${result.passed}`);
    for (const c of result.checks.filter((c) => !c.passed)) {
      console.log(`  FAIL [${c.name}] ${c.message}`);
    }
  }
  process.exit(result.passed ? 0 : 1);
}
