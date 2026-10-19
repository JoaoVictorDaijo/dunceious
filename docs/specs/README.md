# Design specs

Design specs preserve historical decisions and rejected alternatives; code and living
documentation describe the current system. Store specs here, regardless of the authoring
tool, as `YYYY-MM-DD-<area>-<topic>.md` in lowercase kebab-case. The date is the design's
approval date, or the date git first added an old spec without one; the area is the module
or domain it changes.

Every spec starts with YAML front matter containing `title`, `status`, `date`, `areas`,
`prs`, `issues`, `superseded_by` and `summary`. Areas and PR/issue numbers are lists; use
`[]` when no association is known. `superseded_by` is a later spec filename or PR number,
otherwise `null`. The summary is one sentence about the decision, in the spec's language.

Commit a spec as `proposed` with its implementation PR, then set `implemented` and `prs`
in that PR once its number exists. Use `partial` for incomplete implementation and
`abandoned` for a dropped design. When later work replaces a design, change only its front
matter to `superseded` and identify `superseded_by`; preserve the body as history rather
than rewriting it to match current code. Living docs may link to the reasoning in a spec.

Find specs through their metadata (run from the repository root):

```bash
grep -l '^status: implemented' docs/specs/*.md
grep -l 'areas:.*viewer' docs/specs/*.md
grep -H '^summary:' docs/specs/*.md
```

Implementation plans, review records and ledgers, handoffs and session notes stay
untracked in `.code/docs/<task>/` at the primary repository root.
