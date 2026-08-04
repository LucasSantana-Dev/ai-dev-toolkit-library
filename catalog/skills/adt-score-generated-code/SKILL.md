---
name: score-generated-code
description: Deterministic A–F grader for AI-generated code. Zero-LLM — regex/structure checks (anti-patterns, error handling, N+1, hardcoded secrets, sync I/O, index-as-key, a11y). Use right after any code generation, before ship-check; grade < C (score < 60) fails the gate. Ported from forge-space post-gen-scorer.
triggers:
  - score this code
  - grade generated code
  - post-gen score
  - check generated quality
---

# score-generated-code

Deterministic grader for AI-generated code. No LLM call, no dependencies — the LLM's job is generation and interpretation, not pattern matching.

## Usage

```bash
node scorer.mjs <file> [--framework react] [--no-typescript] [--min-score 60] [--json]
```

Exit 0 = pass (score ≥ min-score, default 60). Exit 1 = fail. Human mode prints score/grade + failed checks only; `--json` for machine consumption.

## Checks (weighted)

- Anti-patterns: console.*, TODO/FIXME, inline styles, `!important`
- Structure: exports present, line ≤100 chars, file ≤500 lines, error handling present
- Architecture: file ≤300 lines, ≤10 functions/file, ≤10 props
- Error handling: no empty catch, no log-only catch, no unhandled `.then()`
- Scalability: no N+1 fetch-in-loop, lists need pagination
- Hardcoded: no non-local URLs, no inline secrets (weight 20)
- Engineering: no @ts-ignore/@ts-nocheck, no sync I/O, no index-as-key
- TypeScript (default on): annotations present, no `any`
- React (opt-in via `--framework react`): event handlers, aria/role, list keys, no dangerouslySetInnerHTML

## Grades

A ≥90 · B ≥75 · C ≥60 · D ≥40 · F <40

## In the pipeline

Run after generation, before `ship-check`. Grade < C → fix and regenerate before shipping. Complements `ai-slop-audit` (visual/UX lint) — this one is code hygiene.

## Limits

Regex-level, not AST: it can false-positive on strings/comments containing patterns. Treat failures as triage pointers; `--min-score` tunes strictness. Not a substitute for typecheck/lint/tests — it's the 10ms pre-filter before those run.
