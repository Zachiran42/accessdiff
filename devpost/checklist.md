---
doc: checklist
status: approved
---
# AccessDiff — Build Checklist

Build mode: fast — carried forward from the existing conversation preference, with human hands-on review before declaring the build complete.

The user explicitly approved the technical plan and proceeding to code. Slice 1 implements that original complete journey. After the contest-readiness discussion, Hugo approved the bounded single-relationship removal simulation with “ok lets go”; slice 2 records that extension. Both use the same local architecture and input model. After reviewing the running version, Hugo reported that it seemed correct, requested a repeat verification, and then explicitly asked to proceed. This records overall human acceptance, without attributing individual test actions or learning outcomes to him.

## Slices

- [x] **1. Compare local access, inspect explanations and business deviations, and export the report**
  Becomes usable: A running desktop browser app where the bundled example or local files produce accurate before/after differences, representative explanations, optional business-reference deviations, and a readable local report.
  Why now: This is one small complete workflow; the effective-access kernel and reference assessment are delivered together rather than building a decorative shell first. Mechanical checks prove accuracy before human review.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Features and Behavior`, `prd.md > Bundled Demonstration`
  Spec ref: `spec.md > Components`, `spec.md > Data Model`, `spec.md > Verification`, `spec.md > Where It Runs and How Someone Tries It`
  Build: Bootstrap the native HTML/CSS/JavaScript project, implement strict JSON and graph/reference calculations with their focused tests, wire the single desktop workspace and freshness controls, and add the local report, loopback static server, matched examples, license and input documentation. Parallel file ownership is allowed; integrate through one shared module contract.
  Verify (mechanical): Run `npm test`; start `npm start`; confirm HTTP success and the static allowlist boundaries; use the real browser to load the example, compare, inspect a gain/loss and both business deviations, exercise invalid/no-difference inputs, and export/open the report. Review requests, keyboard controls and long labels. Repair failures before presenting the build as ready to try.
  Learner check: Open http://127.0.0.1:5174/, try the example, inspect Clara's gained contract access and Julien's missing required contract access, then download the report. Report what is confusing, incorrect or worth changing.
  Commit: `Build local AccessDiff comparison and least-privilege review`

- [x] **2. Test one After relationship removal and inspect its consequences**
  Becomes usable: After a current analysis, choose one existing After membership or read grant in a separate simulation panel, test its removal, inspect current After → Scenario access changes and affected alternative paths, then cancel or test another independent removal. Original inputs, reference and analysis remain unchanged; a current scenario is appended separately to the report.
  Why now: Hugo approved this focused extension to demonstrate a concrete permission-refinement decision. It shows that removing a non-required access can also remove a required one, without adding a general editor, service or real-system action.
  PRD ref: `prd.md > Test One Relationship Removal`, `prd.md > Screens and Layout`, `prd.md > Export a Readable Report`, `prd.md > Bundled Demonstration`
  Spec ref: `spec.md > Single-Relationship Removal Simulation`, `spec.md > Import Session and Freshness`, `spec.md > Local Report`, `spec.md > Verification`
  Build: Add pure `src/simulation.js` and `tests/simulation.test.js`, allowlist that exact eighth module, wire the separate relationship/test/cancel controls with current-analysis freshness, and add escaped report evidence. Use all-route recalculation and preserve every existing input/reference/model boundary. Each test starts from the unchanged After snapshot; no cumulative removals.
  Verify (mechanical): Run `npm test`; inspect direct/nested membership and grant removals, alternative routes (including an affected edge absent from the representative shortest path), unrelated retained-access exclusions, no-reference status, unknown relation rejection, input immutability and the 1,000-row scenario bound. In the real browser, test the bundled N1 → N2 removal: Clara loses two rights, one non-required access is removed, one required right is newly missing, and Julien's required contract right is already missing. Verify reset, selection/reanalysis/input/reference invalidation, no-candidate state, keyboard controls, original-analysis preservation and exported scenario parity/escaping. Completed evidence is recorded below.
  Learner check: Try the N1 → N2 removal, explain the difference between Clara's newly missing plan access and Julien's already missing contract access, then cancel and confirm the original results remain. Report any confusing wording or behavior; do not infer hands-on completion from approval to implement.
  Commit: `Add local single-relationship removal simulation`

## Hands-on Checkpoints

- [x] Shared running-app review and feedback received — Hugo reviewed the presented version and accepted the direction. Specific manual operations were not reported and are not claimed.
- [x] Final version reviewed and accepted — Hugo said “cela me semble ok”, requested detailed repeat tests, then confirmed “parfiat on passe a la suite” after the successful results. No further change was requested.

## Final Review

- [x] Final review complete — no unresolved feedback, repeat checks pass, and Hugo explicitly requested the next step.
- [x] Reference-wording revision included in the accepted version — omitted pairs are non-required; successful validation checks format/scope and does not approve business needs.
- [x] Explanation revision included in the accepted version — the interface and report join actual Before access, actual After access and declared need with evidence and vertical paths.
- [x] Simulation included in the accepted version — current After/scenario, new/pre-existing missing rights, alternative routes, cancel and original-report preservation were demonstrated and mechanically rechecked. Overall acceptance is recorded; no individual learner manipulation is asserted.

Hugo first approved implementing the explanation refinements and one-removal simulation, then accepted the resulting version after repeat verification. No further sign-off on the same local version is needed. A reference editor, cumulative scenarios and real-system permission editing remain outside scope. Publishing the source or a video remains a separate action requiring authorization.

## Code Tour and App Map

- [x] Learning activity complete — brief factual source-based recap delivered after revisions; no hands-on practice or learning outcome is claimed.
- [x] Optional edit and transfer reflection addressed — edit not applicable to the recap; one optional reflection offered without making a response a gate.
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse.

Activity and evidence: Brief source-based recap delivered after accepted review. The actual simulation click was connected to session freshness, temporary-copy calculation and the alternative-route acceptance criterion. This is an explanatory recap, not a claim of learner hands-on code practice or mastery.
Route and stops: Reference route: `src/app.js` simulation click handler → `src/session.js` `simulateRemoval` → `src/simulation.js` `simulateRemoval`; calculation results flow back through `renderSimulation`. The calculation source was opened in the editor. The map was rendered in an isolated HTTP preview, shown as a capture, and linked for reopening. Its 14 local file links and 17 source/test anchors were checked; zero scripts, external assets or horizontal overflow. The native details control was verified with Enter. Direct `file:` opening is unavailable in the controlled browser; offline suitability was checked from the self-contained HTML and local paths, rather than claimed as an observed file-protocol execution.
Edit outcome: Not applicable to this brief recap; no functional change was requested after acceptance.
Reflection: One optional transfer question offered in the chat; it does not block progression. Any personal answer belongs only in the ignored learner profile.
Activity mode: Source-based recap with a take-home reference route; no additional manual exercise or learning outcome is inferred.

## Revisions

- Path node evidence includes an optional entity-change marker so deleting a resource/person is distinguishable from removing a membership; this fulfills the existing explanation requirement without changing the workflow.
- The format-help link serves only the exact public input-format document; all planning, private and arbitrary paths remain blocked.
- A separate matrix transitive-closure oracle checks 64 graph pairs against the access engine. It strengthens the agreed precision checks without adding a framework or runtime dependency.
- Accepted expert-review refinement: clarify the reference contract at import, join Before/After/declared-need evidence in the selected finding and report, and improve readable path layout. Deleted After entities are explicitly outside the supplied reference's scope. Access computation, limits, local processing and runtime dependencies are unchanged.
- Approved removal-simulation extension: one existing After relationship in a temporary copy; separate losses, affected rights retained through alternative paths and reference consequences. Distinguish non-required access removed, newly missing required access, already missing required access and remaining non-required access. Preserve the original analysis and reference; reset/no accumulation; clear scenarios on new input/reference/analysis. A scenario separately rejects more than 1,000 combined changes, scenario reference findings and retained pairs. No external action, dependency or cost is added.
- Close the shared review from actual overall feedback rather than requiring duplicate sign-off or attributing unreported individual manual steps. The accepted version and repeated agent-operated checks are distinguished explicitly. The wrap-up uses a brief factual code/acceptance-criterion recap; no learner learning outcome is claimed.

## Mechanical Verification — 2026-10-11

- `npm test`: 100 tests/subtests passed, including the independent 64-pair oracle, session races, strict validation, escaping and HTTP boundaries.
- Actual desktop browser: example produces Clara's two gains and Julien's two losses; both business deviations and their evidence are correct. Enter selects a result and preserves focus.
- Malformed After JSON blocks analysis; incomplete reference coverage blocks analysis and disables the old export. Removing the reference produces explicit not-assessed status. Identical snapshots produce no changes.
- Long labels wrap with no horizontal overflow. Browser warning/error log is empty. Observed assets are all local: seven modules, stylesheet and three example JSON files.
- The real downloaded report was inspected, copied byte-for-byte into a temporary isolated local preview and visually checked. It contains all four changes, both business deviations and the actual missing requirement `requiredRead[2]`.
- A local implementation checkpoint protects the verified code. Slice completion, human checkpoints and final review stay unchecked until learner feedback is actually received.

## Accepted Explanation Revision — Mechanical Evidence

- 108 tests/subtests passed after adding joined access context and report evidence. The independent 64-pair matrix oracle also checks each finding's Before/After/required context against its independent access sets.
- Actual browser: the example still gives 2 gains, 2 losses and the same two business deviations. Clara's plan gain is marked required; her contracts gain is marked not required; Julien's missing contract right is shown as present Before, absent After, and required.
- Reference removal displays not-assessed context. A complete empty After/reference marks historical losses outside the reference scope. These states remain distinct from not required.
- Identical effective access with an empty complete requirement list shows unchanged non-required rights as present both Before and After. Long person/resource labels wrap with no horizontal overflow.
- Enter still selects a result. Reference format/scope validation and omitted-pair guidance are visible beside imports. The real downloaded report has six matching findings/context summaries and four changed-path causes, and was inspected in an isolated local browser preview.
- The revision is implemented and mechanically verified. The learner retry and final-review boxes above remain pending actual feedback.

## Approved Simulation Extension — Mechanical Evidence

- `npm test`: 133 tests/subtests passed, with no failures. New checks cover one-removal effects, direct grants, alternative routes outside the representative path, reference impact, the combined 1,000-row bound, immutable inputs, independent scenarios, session freshness and escaped report evidence. An independent all-route enumeration checks 32 generated DAGs and every removable relationship. A separate reviewer found no blocking defect in the engine/session/report contract.
- Actual browser: the bundled N1 → N2 removal gives Clara two losses, one non-required access removed, one newly missing required access and one previously missing required access (Julien/Contracts). Original comparison stays at two gains and two losses. The required plan loss is selected initially, with current After/scenario context and the removed relationship annotated.
- A local fictional fixture adds a direct Clara/Plan grant. Testing N1 → N2 then loses Contracts only and retains Plan through the direct route, with zero newly missing needs. A subsequent direct-grant removal starts from original After and retains Plan through the groups, proving the earlier removal did not accumulate.
- Selecting another relation clears the previous scenario before testing. Cancel restores the original comparison/export state. Reference removal and an After-file replacement clear the scenario and invalidate the old export. Without a reference, business metrics show not-assessed rather than zero. Empty After disables relation controls and explicitly states no relation is available.
- Native Enter selection preserves finding focus. After testing, focus moves to the scenario title and the consequences scroll into view. Long labels wrap without horizontal overflow at the desktop viewport. Browser warning/error log is empty; observed assets are eight local modules, one stylesheet and three bundled JSON files, with no external assets.
- The real downloaded report was inspected as a byte-identical copy in an isolated local preview. It retains the original six findings, appends two simulated losses and the pre-existing missing requirement, uses current After/scenario labels, and contains no script or external asset. The temporary report preview was closed and its server stopped.
- This is an implementation checkpoint. Slice completion, learner retry and final review remain unchecked pending actual human exploration and feedback; no learning outcome is inferred from these mechanical checks.

## Repeat Verification and Accepted Review — 2026-10-11

- The complete suite passed again: 133 tests/subtests, zero failures. An independent supplementary DFS oracle checked 9,216 removal/reference scenarios across all 512 acyclic graphs in a one-person, two-group, two-resource universe and all four requirement distributions. This is bounded-model evidence, not a full-ACL certification.
- The real browser repeat covered the standard scenario, keyboard selection, existing missing rights, reset and base-only export, absent reference, malformed After input, retained alternative paths, non-cumulative successive tests, empty After and a downloaded scenario report. The report preserves six original findings and three scenario findings; no script or external asset. Browser warning/error logs were empty. No application correction was needed.
- Hugo accepted the presented version, requested the detailed repeat verification, then explicitly requested progression. Earlier pending-review statements above describe their historical checkpoint; this entry closes the overall review without inventing specific learner-operated test steps.
- A short source/criterion/test recap and the checked standalone map complete the build wrap-up. The map references code checkpoint `e3f8d52`; no personal reflection or private learner-profile material is included.
- No remote, public repository, upload or competition submission has been created by this step. Public delivery and author-written application/video content remain separate work.
