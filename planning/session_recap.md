# USCIS Civics Test Simulator — Brainstorm Recap

## Decisions locked in tonight

- **Test format**: Simulates the real 2025 civics test — 20 questions drawn from the 128-question pool, 12 correct needed to pass, interview stops early once pass/fail is clear (12 correct or 9 wrong).
- **Question types**: Multiple choice only. **(Revised in session 4 — true/false format was dropped entirely.)** The question stem and correct answer must use exact wording from your uploaded question bank; only the incorrect distractor options are invented. This applies to the rotating-answer approach for multi-answer questions too — the app rotates between your source's own listed acceptable answers, never paraphrased or invented correct answers.
- **Exam modes**: Full random exam, category drilling (7 topics), and missed-questions review.
- **Phase 1 scope**: Free-only. No accounts, no backend, no payments yet — just the working exam simulator.
- **Hosting**: Static site on GitHub Pages (no server-side code).
- **Session handling**: Resumable on the same device via localStorage (bilingual "Resume exam / Reanudar examen" prompt), auto-expires after 1 week.
- **State/local scope**: Virginia, North Carolina, Maryland, and D.C. Virginia gets full district-level (all 11) House representative data; NC and MD are state-level only (no district breakdown) for now.
- **Language**: Bilingual EN/ES throughout, sourced from your uploaded question bank.
- **Dev workflow**: Use this chat for planning/research; switch to Claude Code for actually writing and committing the app code to your GitHub Pages repo.

## Artifacts produced tonight

1. **`current_officeholders.json`** — President, VP, Speaker of the House, Chief Justice. Nationwide, state-independent.
2. **`state_local_lookup.json`** — Senators, governor, capital, and (for VA only) full 11-district representative lookup for VA/NC/MD/DC.
3. **Interactive wireframe** (viewed inline in chat, not a downloadable file) — start screen, question screen, results screen showing the exam flow shape.

## Decisions locked in during session 3 (resolves prior open items)

1. **VA district lookup**: Zip-code based. Note: zip codes don't map 1:1 to congressional districts everywhere, so the app needs a zip-to-district reference table plus a fallback (show most likely district, let user confirm/override) rather than treating it as guaranteed-exact.
2. **D.C. dropped from scope entirely.** State/local coverage is now Virginia, North Carolina, and Maryland only. The `state_local_lookup.json` file has been updated to remove the D.C. section.
3. **Missed-question logic**: Based on most recent attempt only. If a student gets a question right after previously missing it, it drops out of the missed-question pool.
4. **Multi-answer grading**: Multiple choice format, with the correct answer rotating between the question's acceptable answers each time it's served (Option C). Example: for "Name one right in the First Amendment," the app might show "speech" as correct one time and "religion" as correct the next, keeping the distractors as clearly wrong options.
5. **Wireframe**: Approved as-is for now. UI polish (colors, spacing, copy) deferred to later iteration.

## Decisions locked in during session 4

1. **True/false format dropped entirely.** All practice questions are now multiple choice only. Question text and the correct answer must be exact wording from your uploaded `USCIS_CIVICS_TEST_128_QUESTIONS.docx` — no rephrasing into standalone factual statements. Wrong-answer distractors can still be invented.
2. **Implication for the wireframe**: the true/false example shown in the earlier mockup (the Constitution amendments question) is no longer representative — every question card should follow the multiple-choice pattern shown in that same mockup instead.
3. **Implication for data model**: when Claude Code builds the merged question-bank JSON file, each entry's `correct_answer` field should be copy-pasted from the source document rather than newly written, to guarantee fidelity to the original material.

## Decisions locked in during session 5

1. **Distractor generation**: Auto-generated from other questions' answers, restricted to the same category (safer — avoids a distractor that's technically true but for an unrelated topic).
2. **Guardrail needed**: distractor logic must exclude any answer that is also an acceptable correct answer for the *current* question (relevant for multi-answer questions like Q76, which accepts "American Revolution," "Revolutionary War," or "War for Independence" — none of those three should appear as a wrong-answer option for that question).
3. **State-specific question flow**: ask the test-taker's state first, then zip code, and use the lookup table to fill in the correct answer before generating the question. Zip-to-district mapping isn't perfectly 1:1 — needs a reference table plus a fallback for ambiguous zips (show most likely district, let user confirm/override).
4. **State coverage**: VA, NC, and MD only. Test-takers from any other state are blocked from state-specific questions for now (no generic fallback message — simply out of scope).
5. **NC/MD representative data — resolved.** Full district-level data researched and added to `state_local_lookup.json`: all 14 NC districts and all 8 MD districts now have real officeholder data, matching the depth already built for Virginia.
6. **Exam randomization**: Pure random selection from all 128 questions, matching the real test's behavior (no guaranteed spread across categories).

## Refresh reminder (unchanged)

Both `current_officeholders.json` and `state_local_lookup.json` should be revisited after the November 2026 elections — NC's Senate seat is open at minimum, and other seats may shift.

## Open questions / follow-up work before next session

1. **Zip-to-district data source** — need to pick where the VA zip-to-district mapping data comes from (e.g. Census Bureau geocoding, a congressional district API, or a static hand-built table). Worth deciding before Claude Code starts scaffolding that feature.
2. **Distractor generation for rotating multi-answer questions** — with Option C, the "wrong" options still need to stay clearly wrong across every rotation. Worth a spot-check on a few example questions once the data file is built.

## Not yet decided (no rush, but will come up eventually)

- Free vs. paid feature split specifics (you said no preference yet)
- Backend/accounts approach for cross-device sync (deferred — Phase 1 is device-local only)
- Payment processor for the eventual paid tier
