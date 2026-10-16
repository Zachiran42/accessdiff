---
doc: prd
status: approved
---
# AccessDiff — Product Requirements

A desktop browser tool for IT administrators to compare effective read access and inspect the paths behind each change.

This product definition develops the approved scope and Hugo's chosen visual direction. Hugo approved it with "je valide !", including the recommended layout, demo scenario, and session behavior.

Subsequent direction from Hugo: precise permission refinement under a minimum-rights policy. The supplied-business-reference requirements below capture that request. The optional file contract and evaluation details were accepted through the `spec.md` review.

Hugo approved the subsequent single-relationship removal simulation with “ok lets go”. This adds a bounded local scenario after analysis; it does not change the input model, runtime architecture or external permissions.

## The Core Journey
Source: `scope.md > The Core Loop` and `scope.md > What "Working" Looks Like`.

1. Open AccessDiff and choose the bundled fictional example or supply two local snapshot files.
2. Identify which snapshot is before and which is after. Optionally load a complete business reference of required read access for the after snapshot. The supplied inputs are validated before analysis.
3. Compare them and see which people gain or lose read access to which resources.
4. Select a difference to see the relevant access path and the changed relationships on that path.
   When a valid business reference is supplied, separately inspect accesses not required by that reference and required accesses that are missing afterward.
5. Optionally select one existing After membership or read grant in a separate simulation panel, test its removal, and inspect consequences relative to the current After snapshot. Reset or choose another single relationship; removals do not accumulate.
6. Export a readable report containing the original comparison and its explanations, with a separately identified current simulation when one exists.

## Screens and Layout
Source: `scope.md > The Core Loop` and `scope.md > Inspiration & Identity`.

Approved layout: one desktop workspace, so the administrator can compare results with their explanation without changing pages.

- **Header:** product name, a short purpose statement, and a visible indication that processing takes place locally.
- **Inputs:** two adjacent areas labelled Before and After, each displaying its file name and validation state. Provide a clear bundled-example action and a Compare action.
- **Business reference:** add a compact optional file control beside the comparison inputs, clearly describing its exhaustive coverage of the after snapshot. Provide an explicit way to remove it. It does not replace either snapshot.
- **Results:** below the inputs, a list of changed access with person, resource, and Gained/Lost labels. Two modest counts distinguish gained and lost access; counts refer to person/resource access pairs, not the number of people.
- **Explanation:** beside the list, show the selected result's name, access present/absent Before and After, and the declared business need together. Include the relevant snapshot, representative path and changed relationships in plain language. If nothing is selected, invite the reviewer to select a change.
- **Reference findings:** use a separate view in the same results area for deviations from business needs. Do not mix gains/losses with excess/missing labels. An unchanged access may still be unneeded, and a gained access may be required.
- **Removal simulation:** a separate panel available after analysis lists existing After memberships and read grants. A Test action calculates one removal, labels the comparison **current After → Scenario**, presents losses and affected access retained through other paths, and provides Reset. With a reference, separate removed non-required access, newly missing required access, already missing required access and remaining non-required access. Without one, state that business needs are not assessed.
- **Report:** an Export report action becomes available for a current completed comparison, including a comparison with no effective access differences.

All primary controls remain reachable by keyboard. Selection is visible, and long person, group, and resource names wrap rather than making the path unreadable.

## Look and Feel
Hugo's direction: a restrained design with a subtle hospital-sector influence, without making that influence too obvious.

Approved interpretation:

- Very light neutral background, white working surfaces, slate-blue headings and primary actions, and restrained sea-green accents.
- Clear system typography, comfortable spacing, light dividers, and limited decoration.
- Gained/Lost labels and simple symbols accompany the colors; color alone never carries the meaning. Gains and losses are observations, not verdicts that access is correct or incorrect.
- An access path is an orderly sequence of named steps with clear arrows and changed-relationship annotations, not an exploratory graph.
- No hospital logo, medical cross, stock imagery, decorative dashboard, or attention-seeking animation.

Use plain French interface wording for Hugo's initial review. The canonical planning documents remain in English; a translated submission or walkthrough can explain the interface for judges.

## Features and Behavior

### Load and Validate Snapshots
Source: `scope.md > The POC Boundary`.

- Accept two local files in one documented format, with explicit before/after roles.
- Provide a bundled fictional example so the entire workflow is demonstrable without preparing files.
- Validate people, groups, resources, memberships, grants, and their stable identifiers.
- For malformed or unsupported data, explain which input cannot be used and why. Do not display a partial calculation as a complete comparison.
- Keep input processing within the browser; do not send snapshots to a runtime service.
- Replacing either file invalidates the previous comparison and clears the old explanation until the replacement inputs are validated and compared.

Observable criteria: the example can be loaded; invalid input produces an understandable error; a comparison is not available until both inputs are valid.

### Compare Effective Read Access
Source: `scope.md > The Unique Kernel` and `scope.md > The POC Boundary`.

- Report differences per person and resource, distinguishing gained and lost read access.
- Follow direct grants and nested group membership, using the union of valid grant paths.
- An access exists if at least one valid path grants it. Removing one path while another remains does not produce a loss.
- A changed membership or grant with no resulting effective access change does not become an access gain or loss.

Observable criteria: the example shows both gains and losses; a remaining alternative path prevents a false loss; identical effective access produces an explicit no-difference result.

### Explain an Access Change
Source: `scope.md > The Unique Kernel` and `scope.md > What "Working" Looks Like`.

- For a gain, show a valid access path in the after snapshot.
- For a loss, show a valid path from the before snapshot and identify relationships that no longer exist afterward. The loss means that no other valid grant path remains afterward.
- Use recognizable names for the person, groups, and resource, with clear path direction.
- Identify changed relationships on the explained path. If several changes participate, do not claim that one relationship alone explains the entire result.
- Keep observed differences separate from a judgment that access is appropriate, secure, or compliant.
- Show one representative path per changed access and label it as such. Do not imply that the path is the only route or that a changed edge alone explains every change in the dataset. Exploring all alternative paths is deferred.
- Show the selected pair's actual Before and After access together with its declared need. A pair whose person or resource is absent from After is outside that reference's scope, rather than declared unneeded.

Observable criteria: the displayed path belongs to the appropriate snapshot, reaches the named resource, and exposes the changed relationship rather than merely repeating the result label.

### Assess Declared Minimum Access
Source: `scope.md > The Unique Kernel` and `scope.md > The POC Boundary`, elaborating Hugo's least-privilege request.

- Accept an optional local business reference explicitly declaring all read access required for the after snapshot's complete set of people and resources.
- Validate its coverage against the after snapshot. A reference with missing/extra people or resources, an unknown ID, or contradictory data cannot produce a business-needs assessment.
- Classify accessible-after pairs absent from the reference as **not required according to the reference**. Explain them using a valid after access path, even when that access did not change.
- Classify reference-required pairs inaccessible afterward as **required access missing**. Cite the declared requirement and the absence of a valid access path; do not invent a path for the missing access.
- Make the reference's author responsible for the declared business needs. Structural validation cannot certify that the business declaration is correct.
- State beside the import that every omitted pair is declared not required. Label successful reference validation as format and scope validation, without implying business approval.
- With no reference, show **minimum-access assessment not performed**. With a complete valid reference and no deviations, show **no deviations from the supplied reference**, not a general compliance or security claim.
- Do not recommend deleting a particular group relationship or apply any correction automatically; that relationship may also grant required access.

Observable criteria: the extended example has one gained access that is required, one gained access that is not required, and one lost access that is still required. Missing or mismatched coverage never produces an all-clear assessment. Empty differences do not prevent finding an unchanged, unneeded access.

### Test One Relationship Removal
Source: Hugo's approved extension following the contest-readiness review; `scope.md > The Core Loop` and `scope.md > The POC Boundary`.

- Offer only memberships and read grants that exist in the validated After snapshot. Test exactly one removal in a temporary copy; keep Before, After, the business reference and the original analysis unchanged.
- Always start from the current After snapshot. Selecting another relationship or resetting clears the previous scenario; there is no cumulative editing or application to a directory.
- Recompute effective access over all remaining routes. Show losses with their former After path, and show a retained pair only when a valid route used the removed relationship and another route still grants that same access in the scenario.
- With a valid reference, distinguish non-required access removed, required access newly missing because of the removal, required access already missing in After, and non-required access remaining in the scenario. Pre-existing missing access must not be attributed to the simulated removal.
- Without a reference, show observable access effects and alternative-path evidence, with business needs explicitly not assessed. Do not interpret zero assessed findings as approval of a removal.
- Do not call a scenario safe, compliant or a recommended correction. The administrator chooses any real action outside this tool.
- Replacing either snapshot, changing/removing the reference or running analysis again clears the simulation. A rejected/stale relationship cannot leave an earlier scenario presented as current.

Observable criteria: removing Support N1 → Support N2 from the bundled After snapshot makes Clara lose two accesses. Contracts is one removed non-required access; the plan is one newly missing required access; Julien/Contracts is one required access already missing. The original two-gain/two-loss comparison remains intact. A separate alternative-route case retains an affected access and explains its surviving scenario path. Reset removes the scenario from the screen and report.

### Export a Readable Report
Source: `scope.md > The Core Loop` and `scope.md > The POC Boundary`.

- Export the current comparison, its explanations, and the supported model's limits as a readable local file.
- Generate the report locally, without an account, external API, or billable service.
- Do not export stale results after one of their input snapshots has changed.
- Include all differences and their representative explanations, not just the currently selected row. A zero-difference report explicitly records that outcome.
- When a valid business reference was supplied, include its file name, declared coverage, excess/missing findings, and the distinction between structural validity and human business approval. Without a reference, explicitly record that the minimum-access assessment was not performed.
- When a current simulation exists, preserve all original findings and append a clearly labelled current After → Scenario section with the selected relationship, losses, retained-path evidence and reference impact categories. Explicitly distinguish newly missing from already missing required access. Without a reference, label the scenario's business-needs assessment as not performed. Resetting or invalidating the scenario removes that section from subsequent exports.

Observable criteria: opening the exported report shows the same changes and explanations as the comparison that produced it.

## States and Boundaries

- **No inputs yet:** show the Before/After inputs, the bundled-example action, and a short explanation of the workflow. Do not display invented results or metrics.
- **One input missing or invalid:** there is no complete comparison to show or export; indicate what is needed.
- **Two valid inputs:** the comparison can be calculated.
- **Reference absent:** comparison remains usable; no business-needs assessment is implied.
- **Reference supplied but invalid or mismatched:** identify the problem and do not produce a current assessment or report. The user can fix or explicitly remove the reference to run comparison alone.
- **No effective access differences:** state that nobody gained or lost read access under the supported model. This does not imply that the files are identical or that all permissions are appropriate.
- **Input changed after comparison:** previous results and their explanations are no longer current and cannot be presented as the result for the replacement input.
- **Simulation ready:** a current completed comparison permits testing one existing After relationship; an After snapshot with no relationships offers no removal candidate.
- **Simulation current:** its consequences are labelled current After → Scenario, separately from the original analysis. Another selection, reset, new input/reference or new analysis clears it; no edits accumulate.
- **Person or resource removed between snapshots:** losses retain the before snapshot's names and explanation evidence.
- **Unsupported permission semantics:** reject them clearly rather than interpreting them as the simplified model.
- **Reload or close:** imported snapshots and results remain only for the open session and must be loaded again afterward. The manually downloaded report is a separate file controlled by the reviewer. Indicate the session behavior near the import controls.

## Bundled Demonstration
Source: `scope.md > What "Working" Looks Like`.

Approved example: an IT team in a fictional hospital, using administrative resources rather than patient records.

Before:

- Nadia belongs to IT Steering.
- Julien belongs to Support N2, which belongs to IT Steering.
- Clara belongs to Support N1.
- IT Steering can read the IT Renewal Plan.
- Support N2 can read Supplier Contracts.

After, two relationships change: Support N1 becomes a member of Support N2, and Julien is removed from Support N2. All other facts remain the same.

Checkable outcome:

- Clara gains access to both resources: two gained accesses.
- Julien loses access to both resources: two lost accesses.
- Nadia retains her access and does not appear as a change.
- Selecting Clara's gain on the plan shows Clara → Support N1 → Support N2 → IT Steering → IT Renewal Plan, with the newly added group relationship identified.
- Selecting Julien's loss shows his former path and the removed membership, without presenting that former path as current access.

Reference extension for the least-privilege demonstration:

- Required access: Nadia → IT Renewal Plan, Clara → IT Renewal Plan, Julien → Supplier Contracts. The reference covers all three people and both resources; every omitted pair is declared unneeded.
- Afterward, Clara's gained plan access is required, while her gained contract access is not required according to the reference.
- Julien's lost plan access is not required, but his lost contract access is still required and therefore reported as missing.
- The original before/after result remains exactly two gained accesses and two lost accesses.

Approved removal simulation:

- Select the After membership Support N1 → Support N2 and test its removal.
- Clara loses Contracts and the IT Renewal Plan relative to After: two losses, no gains.
- One non-required access is removed (Clara/Contracts), one required access becomes newly missing (Clara/Plan), and one required access was already missing (Julien/Contracts).
- Nadia retains Plan, but is not listed as an affected retained access because her access does not use the removed membership.
- Reset or test another single removal from the unchanged After snapshot. The reference and original comparison remain intact.

## Product Decisions

Approved through the scope review:

- Desktop browser application; no native mobile app or store distribution.
- Local files and local processing; no account, billing activation, credit-card setup, paid API, or hosted runtime service.
- First proof of concept limited to read access, positive grants, and direct or nested group membership.
- One complete load → compare → explain → export workflow, with a bundled fictional example.
- No live directory connection, permission editing, or full Windows/Active Directory ACL emulation.

Chosen after the scope review:

- A restrained design with a subtle hospital-sector influence: directly specified by Hugo.

Recommendations accepted through the product review:

- One workspace with inputs above a results list and explanation panel.
- A small IT hospital example with two gained and two lost accesses.
- One representative explanation path per difference.
- Session-only imported data, with local report export and no saved-project feature.
- French interface wording for the initial review.

The observable correctness criteria formalize the approved access model; they do not expand it to Windows ACL semantics.

Requested during technical planning: precise least-privilege refinement. A complete explicit business reference is the basis for that assessment; its technical contract and implementation were accepted through the technical review.

Approved following contest-readiness discussion: a local one-relationship removal simulation with reset, all-route recalculation, alternative-path explanations, and separate new/pre-existing reference consequences. A general reference editor, cumulative scenarios and real-system permission editing remain outside scope.

## What We're Building
A small, demonstrable comparison workflow with valid-input handling, effective-access differences, traceable explanations, one optional relationship-removal scenario, and a local readable report.

## Deferred From the POC

- Write access and other permission types: one permission is sufficient to demonstrate the core idea.
- Real-directory export adapters: the documented input model must be correct before adding platform-specific mappings.
- Large datasets and exploration of every alternative path: outside the first small demonstration.

## Non-Goals
Source: `scope.md > Explicitly Cut`.

- Reproducing deny precedence, filesystem inheritance, or platform-specific ACL rules.
- Modifying an external directory or filesystem's permissions.
- Deciding whether an observed change is legitimate or compliant.
- Inferring business needs, guaranteeing least privilege on a real Windows/AD system, or automatically editing permissions.
- Adding runtime AI, cloud processing, analytics, accounts, billable infrastructure, or native mobile distribution.

## Open Questions

No unresolved product choice blocks the technical plan. The layout, demo, and session behavior were approved together.

Resolved in the approved technical plan: strict snapshot and reference JSON formats, standalone HTML report, cycle rejection, deterministic representative paths, and assessment conditional on a complete business reference.
