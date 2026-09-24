# Trivia Content Format

Purpose: how the 30 trivia questions are stored, tagged, translated and reviewed. It gives the JSON Schema that `trivia-questions.json` must pass, the bucket and difficulty tags, the answer-shuffling rule, a writing guide in the chapter's voice, and the review checklist the team uses before content freeze. Gameplay rules for Trivia are in `docs/games/trivia.md`.

Last updated: 2026-09-25

---

## 1. File

- Path: `docs/content/trivia-questions.json`. This is the **only** source; the app imports it at build time (ADR-116).
- Exactly **30** entries, ids `q01`–`q30`. Slots are pre-assigned to buckets so the mix is right by construction:

| Slots | Bucket | Count | Suggested difficulty mix |
|---|---|---|---|
| q01–q12 | `google_dev`: Google products and general developer knowledge | 12 | 5 easy · 5 medium · 2 hard |
| q13–q24 | `ai_basics`: AI at expo-visitor level | 12 | 5 easy · 5 medium · 2 hard |
| q25–q30 | `gdg_community`: GDG / developer communities, light and public | 6 | 4 easy · 2 medium |

- `status: "draft"` entries are **ignored by the game** (the template ships with 27 drafts and 3 filled examples). A question is used only when `status: "ready"`.
- The file starts with a `_meta` object (JSON has no comments) holding the purpose, last-updated date and a pointer to this doc.

## 2. JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "gdg-booth/trivia-questions",
  "title": "GDG booth trivia pool",
  "type": "object",
  "required": ["_meta", "questions"],
  "additionalProperties": false,
  "properties": {
    "_meta": {
      "type": "object",
      "required": ["purpose", "last_updated", "format_doc", "schema_version"],
      "properties": {
        "purpose":        { "type": "string" },
        "last_updated":   { "type": "string", "format": "date" },
        "format_doc":     { "const": "docs/content/trivia-format.md" },
        "schema_version": { "const": 1 }
      }
    },
    "questions": {
      "type": "array", "minItems": 30, "maxItems": 30,
      "items": { "$ref": "#/$defs/question" }
    }
  },
  "$defs": {
    "text": {
      "type": "object", "required": ["en", "ar"], "additionalProperties": false,
      "properties": { "en": { "type": "string", "maxLength": 140 }, "ar": { "type": "string", "maxLength": 140 } }
    },
    "text_filled_question": {
      "type": "object",
      "properties": { "en": { "minLength": 8, "maxLength": 140 }, "ar": { "minLength": 8, "maxLength": 140 } }
    },
    "text_filled_option": {
      "type": "object",
      "properties": { "en": { "minLength": 1, "maxLength": 60 }, "ar": { "minLength": 1, "maxLength": 60 } }
    },
    "question": {
      "type": "object",
      "required": ["id", "status", "bucket", "difficulty", "question", "options", "source", "reviewed_by"],
      "additionalProperties": false,
      "properties": {
        "id":          { "type": "string", "pattern": "^q(0[1-9]|[12][0-9]|30)$" },
        "status":      { "enum": ["draft", "ready"] },
        "bucket":      { "enum": ["google_dev", "ai_basics", "gdg_community",
                                  "family_everyday", "family_world", "family_science", "family_culture"] },
        "difficulty":  { "enum": ["easy", "medium", "hard"] },
        "question":    { "$ref": "#/$defs/text" },
        "options":     { "type": "array", "minItems": 4, "maxItems": 4, "items": { "$ref": "#/$defs/text" } },
        "source":      { "type": "string", "maxLength": 300 },
        "reviewed_by": { "type": "array", "items": { "type": "string", "minLength": 1 } },
        "notes":       { "type": "string", "maxLength": 300 }
      },
      "if":   { "properties": { "status": { "const": "ready" } } },
      "then": {
        "properties": {
          "question": { "$ref": "#/$defs/text_filled_question" },
          "options":  { "items": { "$ref": "#/$defs/text_filled_option" }, "uniqueItems": true },
          "source":   { "minLength": 1 }
        }
      }
    }
  }
}
```

Also checked by the content script (`npm run check:trivia`, a Phase 3 task), which JSON Schema can't express:
- ids are exactly `q01`…`q30`, in order, each once; slot buckets match §1.
- In **strict mode** (run before content freeze): every question is `ready` and has **≥ 2 names** in `reviewed_by`.
- No two ready questions have the same English text or the same correct answer text.

## 3. Fields

| Field | Rule |
|---|---|
| `question.en` / `.ar` | One sentence, ≤ 140 characters, ends with "?" (Arabic "؟"). |
| `options[0]` | **Always the correct answer.** The phone shuffles all four per player (Fisher–Yates, per-round seed), so position in the file never leaks. |
| `options[1..3]` | Plausible wrong answers of similar length and style to the correct one; ≤ 60 characters. |
| `source` | A URL or "common knowledge" for obvious facts. Used by reviewers, never shown. |
| `reviewed_by` | Names of team members who checked the fact, the Arabic, and the fairness. |
| `notes` | Anything reviewers should know (e.g. "brand name stays Latin in Arabic"). |

## 4. Writing guide

- **Answerable by a visitor.** No insider questions (not "Who was our 2023 lead?", not "When was our chapter founded?"). Prefer facts a curious student or developer could know or reason out.
- **One clearly correct answer**, stable over time. Avoid "latest", "current", "most popular", version numbers and anything that changes between writing and the event.
- **Options work shuffled.** Never "All of the above", "None of the above", "Both A and B", or options that refer to each other. No true/false (4 options always).
- **Friendly tone**, a little playful, never a trick. A wrong answer can be funny, but not mean.
- **Short**: the question is read under a 10 s timer on a phone.
- **Arabic**: Modern Standard Arabic, natural rather than literal. Brand and product names stay in Latin script (Google, Android, Gemini, GDG); technical terms get the common Arabic term with the English in brackets once when needed, e.g. «الموجّه (Prompt)».
- **Neutral**: no politics, religion, nationality or gender stereotypes; no questions that favour one language group.
- **AI bucket level**: what AI is and does in everyday terms (prompts, training data, chatbots, image recognition, hallucinations), not math or research trivia.
- **GDG bucket**: public, light facts (what GDG stands for, that chapters are volunteer-run and free, what a "DevFest" is).

## 5. Review checklist (per question)

- [ ] Fact verified against the `source`.
- [ ] Exactly one correct option; the three distractors are clearly wrong to someone who knows.
- [ ] Still correct if read on the event date.
- [ ] Works with any option order (no "all/none of the above").
- [ ] English: clear, ≤ 140 / ≤ 60 characters, no idioms that don't translate.
- [ ] Arabic: reviewed by a native speaker; same meaning as English; correct «؟»; brand names in Latin.
- [ ] Fair to a non-member visitor (no insider knowledge).
- [ ] Bucket and difficulty tags right (difficulty guess: easy ≈ 80 % of visitors get it, medium ≈ 50 %, hard ≈ 25 %).
- [ ] Two reviewers' names added to `reviewed_by`.

## 6. Freeze

Content freezes with the last production deploy before the event (ADR-032). After freeze, fixing a wrong question means a new deploy, which is not allowed on event days, so review early. Owner of the 30 questions: OQ-03.

## 7. Family test set (ADR-133)

A second pool, `docs/content/trivia-questions-family.json`, holds 30 general-knowledge questions for all ages, for testing with family and friends outside the expo. It never ships to the event: the build uses it only when `TRIVIA_POOL=family` is set (a local `.env.local`, or a branch deploy / deploy preview context on Netlify, never production).

- Same schema, ids `q01`–`q30` (so the server's Trivia bounds are unchanged), same writing guide (§4) and field rules (§3).
- Slots and buckets:

| Slots | Bucket | Count | Difficulty mix |
|---|---|---|---|
| q01–q08 | `family_everyday`: everyday life & food | 8 | 4 easy · 2 medium · 2 hard |
| q09–q16 | `family_world`: world & nature | 8 | 3 easy · 3 medium · 2 hard |
| q17–q23 | `family_science`: science & fun facts | 7 | 3 easy · 2 medium · 2 hard |
| q24–q30 | `family_culture`: Arabic language & culture | 7 | 2 easy · 3 medium · 2 hard |

- The family draw is by difficulty, not bucket: each player gets 2 easy, 2 medium and 1 hard, from different buckets where possible (`docs/games/trivia.md` §2).
- `npm run check:trivia` validates both files; `--strict` applies to the event pool only.
