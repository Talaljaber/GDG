---
paths:
  - "docs/**"
---

# Docs rules

Loaded when editing documentation.

- Every doc starts with a one-paragraph purpose statement and a "Last updated: YYYY-MM-DD" line; bump the date when you change it.
- One source of truth per fact: numbers live in `SCORING.md` (scoring, bounds) and `SESSION_LIFECYCLE.md` §1 (timings); other docs repeat them only where needed and must match exactly. If you change a number, grep all docs for it in the same change.
- Terms follow `GLOSSARY.md`.
- New decisions → a new ADR in `DECISIONS.md` (Proposed unless the team confirmed it). Never rewrite an Accepted ADR without the team's explicit OK; propose the change in `OPEN_QUESTIONS.md` instead.
- New screen or state → strings in `COPY.md` (EN + AR) and keys listed in `SCREENS.md`.
- Platform limits must cite an official doc URL with the date checked.
- Keep `docs/README.md` one line per file; keep `CLAUDE.md` under ~150 lines.
