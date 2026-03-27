## Summary

<!-- Briefly describe what this PR changes and why. -->

## Type of change

- [ ] Refactor (no behavior change — see checklist below)
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation / config / tooling

---

## ✅ No-behavior-change checklist

> **Required for every PR on the `refactor/modular-architecture` branch.**
> All boxes must be checked before merging a refactor PR.

- [ ] **App boots** — dev server (`npm run dev`) starts without errors.
- [ ] **Build passes** — `npm run build` completes with no errors or new warnings.
- [ ] **Lint passes** — `npm run lint` exits 0 (0 errors; warnings are acceptable for pre-existing issues).
- [ ] **All tests pass** — `npm run test` shows 0 failed tests.
- [ ] **GenBank loading unchanged** — loading a `.gb` file produces the same records as before.
- [ ] **Alignment unchanged** — running an alignment produces the same aligned sequences and consensus.
- [ ] **Search unchanged** — exact and fuzzy queries return the same results as before.
- [ ] **Export unchanged** — exporting a selection produces the same output format as before.
- [ ] **No new `any` types introduced** (new code must be fully typed).
- [ ] **No logic moved without a unit or integration test** covering the extracted code.

---

## Testing

<!-- Describe how the change was tested (unit, integration, manual). -->

## Related issues / phases

<!-- Link the migration checklist issue or phase this PR belongs to. -->
