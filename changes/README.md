# Changelog fragments

Each PR adds one `changes/unreleased/<short-slug>.md` file with a unique,
lowercase kebab-case name. Describe the change in one or two nonempty lines:

```markdown
---
type: Fixed
---
Preserve annotation coordinates when exporting aligned sequences.
```

The front matter contains only `type`, with one of `Added`, `Changed`, `Fixed`,
`Removed`, or `Security`. Use a plain body without a leading list marker; two
lines are joined into one release-note entry. Do not append new entries directly
to `CHANGELOG.md`; existing Unreleased content stays in place.

At release time, from the repository root, run:

```sh
npm run changelog:release -- 3.2.0
npm run changelog:release -- 3.2.0 2026-10-15
```

Choose one invocation; the date defaults to today in UTC. The version is `X.Y.Z`
without a `v` prefix. The script inserts a release section beneath Unreleased,
after any existing pending content. It groups fragments in Added, Changed, Fixed,
Removed, Security order and sorts entries within each group by filename. Empty
categories are omitted. It deletes consumed fragments; commit these deletions
with the updated changelog and version bump.

Invalid arguments, an existing release version, an empty batch, or any malformed
fragment fail before any file is changed. Correct the named fragment and rerun.
