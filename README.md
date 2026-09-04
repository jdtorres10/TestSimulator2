# U.S. Civics Test Simulator 2 🇺🇸 (in-progress / test build)

A bilingual (English / Spanish) practice simulator for the **2025 USCIS citizenship civics test**. Pure static site — plain HTML, CSS, and JavaScript, **no build step**. Just push it to GitHub Pages.

> **This is the `TestSimulator2` test build** — a separate repo kept apart from the original until it's ready for customers. It reflects the session 3–5 design decisions (see `planning/session_recap.md`).

## What it does

- **Full practice exam** — 20 questions drawn from the pool of 128; **12 correct to pass**; the interview **stops early** once a pass (12 correct) or fail (9 wrong) is certain, exactly like the real test.
- **Multiple-choice only** — question stems and correct answers are **verbatim from the USCIS source**; only the wrong-answer distractors are generated.
- **Rotating correct answers** — for questions with several acceptable answers, the correct option rotates among them each time the question is served.
- **Auto-generated distractors** — wrong options are drawn from *other questions' answers in the same category*, and never include an answer that's also acceptable for the current question.
- **Practice by topic** — drill any of the 7 categories with immediate feedback.
- **Review missed questions** — most-recent-attempt logic: miss a question and it enters the pool; get it right and it leaves.
- **Read aloud (English)** — a 🔊 button reads each question in English (Web Speech API) for oral-interview practice, with a natural-voice picker.
- **End / Home anytime** — every question has an End-and-see-results button and a Home button (both confirm first).
- **Built for Spanish speakers** — the primary audience. In **Spanish mode**, every question, option, and answer shows its **English translation underneath**. English mode shows English only.
- **Resumable** — an unfinished exam is saved on the device (localStorage) for up to 1 week.
- **State-aware** — **Virginia (11), North Carolina (14), Maryland (8)** — full congressional-district data. The user picks their state, enters a **ZIP code** (suggests a district), then confirms/overrides via the picker. *(D.C. is out of scope.)*

## ZIP → district data

`data/zip_districts.json` is built from the **U.S. Census Bureau 119th-Congress CD → 2020 ZCTA relationship file** (`tab20_cd11920_zcta520_natl.txt`), which matches the representatives elected in 2024 (serving through Jan 2027). Coverage: VA 907 ZIPs, NC 853, MD 478. For ZIPs that straddle two districts, the district with the **largest land-area overlap** is chosen, and the app always lets the user **confirm or override**. Rebuild from the next relationship file after redistricting. (Regenerate via `scratchpad/build_zips.py`.)

## Project layout

```
TestSimulator2/
├── index.html                     App shell
├── css/styles.css                 Styles (light + dark, responsive)
├── js/
│   ├── i18n.js                     Bilingual UI strings
│   └── app.js                      Exam engine + rendering
├── data/
│   ├── questions.json              128 questions: verbatim stems + acceptable-answer lists
│   ├── current_officeholders.json  President, VP, Speaker, Chief Justice
│   ├── state_local_lookup.json     Senators, governor, capital, VA/NC/MD reps by district
│   └── zip_districts.json          ZIP→district suggestions (empty until sourced)
└── planning/session_recap.md       The design decisions this build implements
```

## Running it locally

The app loads its data with `fetch()`, which browsers **block over `file://`**. So don't just double-click `index.html`. Serve the folder over http instead:

```bash
cd TestSimulator
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying to GitHub Pages

1. Create a repo (e.g. `TestSimulator`) and push this folder to it.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` (root).
3. Your site goes live at `https://<your-username>.github.io/TestSimulator/`.

No Actions, no bundler — GitHub Pages serves the files as-is over http, so `fetch()` works.

## Maintaining the answer data

Two files hold answers that **change with elections** — revisit them after the **November 2026** elections:

- `data/current_officeholders.json` — nationwide offices (President, VP, Speaker, Chief Justice).
- `data/state_local_lookup.json` — senators, governor, capital, and Virginia's district representatives.

Each has a `_notes` / `last_verified` field. Update the values and the date; no code changes needed.

To regenerate the question bank, edit `scratchpad/gen_questions.py` and re-run it (it writes and validates `questions.json`).

## How the 128 questions were converted

Each official open-ended question became **one** quiz item — mostly multiple-choice (4 options, one correct) with authored distractors, plus true/false for clean numeric/factual items. The 8 **dynamic** questions (your senator, representative, Speaker, President, VP, Chief Justice, governor, state capital) are filled in at runtime from the JSON data based on your selected state/district.

**Not affiliated with USCIS.** For study practice only.
