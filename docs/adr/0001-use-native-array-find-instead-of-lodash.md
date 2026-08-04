# ADR-0001: Use native Array.find() instead of lodash _.find() for simple lookups

- **Status:** Accepted
- **Date:** 2026-06-24
- **Deciders:** Lucas Santana
- **Supersedes:** —
- **Superseded by:** —

## Context

We need to filter a user object in a single React component with a simple lookup operation. The question arose whether to use the native ES2015 `Array.find()` method or the lodash `_.find()` utility. This is a tooling and dependency decision that will affect code clarity, bundle size, and maintenance burden.

## Decision

We will use native `Array.find()` for simple single-element lookups in modern React applications. This provides zero dependency overhead, identical algorithm performance, and eliminates version management burden for a language feature already universally supported in modern JavaScript.

## Alternatives considered

- **lodash _.find()** — Adds ~66KB minified to bundle; introduces version management and dependency maintenance burden; identical algorithm to native implementation; useful when standardizing on lodash ecosystem for other utilities (e.g., `_.groupBy`, `_.debounce`, `_.cloneDeep`).
- **Array.findIndex + manual indexing** — More verbose syntax (`arr[arr.findIndex(...)]`); no performance benefit; adds cognitive overhead without upside; rejected in favor of cleaner native API.

## Consequences

**Positive:**
- Zero additional dependencies added; reduces bundle overhead and supply-chain risk
- Future-proof: leverages a standardized language feature rather than library version lock-in
- Simplest mental model for maintainers; native method is immediately recognizable
- Eliminates version update coordination if lodash semantics change

**Negative:**
- Cannot be used if supporting legacy Internet Explorer (IE 11 and below require polyfills); unnecessary constraint for modern React stacks
- Slightly less feature-rich than lodash equivalents (no predicate-as-string support like `_.find(arr, 'active')`); but this is rarely needed in typed codebases

**Neutral:**
- Requires developers familiar with ES2015+ standards library; modern React teams expect this baseline

## Critic notes

**Verdict: SOUND.** Decision rationale is solid; choosing native language features over library wrappers for simple operations is a well-established principle. Alternatives are properly scoped. Revisit triggers are concrete.

**Key assumption flagged:** This decision assumes the lookup remains a single search in non-performance-critical contexts. If the lookup moves into a loop, render function, or data-transformation pipeline processing >100 items, re-evaluate the decision and profile before investing optimization effort (though lodash would not improve this, since it also defers to native Array.find()).

**Organizational consistency gap:** If lodash is already a transitive dependency in the codebase, the stated "66KB overhead" marginal cost may be zero. Verify presence in package.json; if lodash exists, the decision rationale shifts from dependency-avoidance to consistency-vs-simplicity.

## Revisit when

- **Adopting lodash ecosystem-wide**: If the project standardizes on lodash for other utilities (groupBy, debounce, memoization, etc.), reevaluate whether `_.find()` fits the established utility import pattern for consistency.
- **Performance profiling reveals bottleneck**: If array searches become measurably slow under production load (e.g., P99 latency exceeds threshold), profile and verify Array.find vs. optimized alternatives before spending time on micro-optimization.
- **Supporting legacy browsers becomes mandatory**: If requirements shift to require IE 11 or earlier support, polyfill or switch to lodash for broader compatibility across old and new code paths.

## References

- MDN: [Array.prototype.find()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find)
- Lodash docs: [_.find()](https://lodash.com/docs/#find)
- ES2015 Language Spec: [Finding an Element](https://tc39.es/ecma262/#sec-array.prototype.find)
