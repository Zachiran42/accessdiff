---
doc: scope
status: approved
---
# AccessDiff

A desktop browser tool that compares two permission snapshots and explains who gains or loses access, and why.

After approving the initial scope and product definition, Hugo requested precise permission refinement guided by least privilege. The supplied-reference assessment described below develops that request; its concrete contract was accepted through the `spec.md` review.

Hugo subsequently approved a focused extension with “ok lets go”: locally test removing one existing After membership or read grant at a time, without altering the supplied snapshots, reference or a real system.

## The Unique Kernel
Explain an effective access change with a traceable path: **person → group → nested group → resource**. Connect the outcome to the changed membership or grant that caused it. Compare effective access rather than just different lines in two files.

For the requested least-privilege direction, compare effective access after the change with explicitly declared business requirements. Distinguish unneeded access from required access that would be missing; do not infer those requirements from group names.

For a selected relationship, calculate the effects of its removal before deciding what to implement: distinguish non-required access removed from newly missing required access, and show affected access that survives through another path.

## Who It's For
An IT administrator reviewing a proposed group-membership or permission change. They need to understand its effect on people before applying it, including indirect access that is easy to overlook when reading group lists.

## The Core Loop
Open AccessDiff, load a bundled fictional example or import two local snapshots, then compare them. Inspect newly gained and removed access, open an explanation, and export the findings as a readable report. Repeat with another pair of snapshots when reviewing another change.

When a complete business reference is supplied, also inspect excess and missing access against that reference in the after snapshot. Without a reference, this assessment is not performed.

After a completed analysis, optionally select one existing After relationship and test a temporary removal scenario. Compare current After with that scenario in a separate panel, inspect consequences, then reset or test another single relationship from the original After. Export preserves the original comparison and clearly separates any current simulation.

## Inspiration & Identity
The defining visual is a readable access path beside the before/after result. Use plain language to distinguish observed differences from decisions about whether access is appropriate. Hugo selected a restrained design with a subtle hospital-sector influence, without overt medical branding. No external visual reference has been selected.

## Why This Matters to the Learner
The selected idea provides a concrete IT demonstration that runs without project accounts, paid APIs, billing activation, or additional subscriptions. It can be built and demonstrated on a computer.

## What "Working" Looks Like
A reviewer opens the fictional example and compares two snapshots. A newly nested group grants a person access to a folder; removing another person's membership removes their access. Both changes appear, and selecting either shows the relevant path in the snapshot where access exists and the changed relationship. The reviewer exports a report containing the differences and their explanations.

The convincing moment: changing one group relationship affects people who were never named in the resource's permission list, and AccessDiff shows exactly how.

The approved simulation adds a concrete decision: removing Support N1 → Support N2 eliminates Clara's non-required contract access, but also removes her required renewal-plan access. Julien's required contract access remains identified as already missing. The original Before/After comparison stays unchanged.

## The POC Boundary
- One complete workflow: load two snapshots, compare, inspect an explanation, export a report.
- One small, documented input format with stable identifiers for people, groups, resources, memberships, and grants.
- For the first proof of concept, one permission: read access. Direct grants and nested group membership are supported; effective access is the union of valid grant paths.
- Access changes are reported per person and resource. A removed path does not count as lost access if another path still grants that access.
- Validate the inputs and clearly report unsupported or malformed data instead of silently producing a partial comparison.
- Provide a bundled fictional example with both a gain and a loss, usable without preparing any files.
- Support an optional local reference declaring the complete set of read accesses required for the after snapshot's people and resources. Assess exact differences from that declared reference, separately from before/after changes. Business correctness of the reference remains a human responsibility.
- Support one temporary removal of an existing After membership or read grant per scenario. Recompute all effective access, distinguish new consequences from pre-existing reference deviations, and show only affected rights retained through an alternative route. No reference means business needs are not assessed.
- Reset scenarios without changing inputs. A new scenario always starts from the current After snapshot; replacing an input, changing/removing the reference or rerunning analysis clears it. Reports identify simulation separately from the original analysis.
- Process snapshots and generate reports locally in the browser. No external runtime service, analytics, account, or paid dependency is required.
- Start from a separate empty project folder. Aim for a small proof of concept suitable for a short demo, rather than a complete identity-governance product.

## Later
- Additional permission types such as write access.
- Import adapters for real directory or file-server exports, each with explicitly documented semantics.
- Larger datasets and additional explanation paths when several routes grant the same access.

## Explicitly Cut
- Full Windows/Active Directory ACL emulation: deny precedence, filesystem inheritance, and platform-specific rules require a different scope. Results describe the supported input model only.
- Live directory connections or permission editing: the demonstration compares supplied snapshots and does not change an external system.
- Inferring business needs or declaring access legitimate, safe, or compliant: the tool explains changes and deviations from explicitly supplied needs. An administrator decides which changes to implement.
- Automatic permission remediation, a general-purpose policy editor or cumulative scenario editing: only one existing relationship can be removed in a temporary local scenario. No external permission is edited and no safe-removal verdict is supplied.
- Runtime AI or hosted processing: deterministic local computation is sufficient for this workflow and avoids billable services.
- Native mobile apps, store distribution, paid infrastructure, credit-card setup, and free trials exposing the user to charges: excluded by the project's constraints.
