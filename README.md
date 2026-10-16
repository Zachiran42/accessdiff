# AccessDiff

**Understand who gains or loses read access, and trace the relationships behind each change.**

AccessDiff is a local desktop browser proof of concept for IT administrators. It compares two supplied permission snapshots, follows direct grants and nested group memberships, and shows one representative explanation for each effective access change. An optional, exhaustive business reference distinguishes access not required by that reference from required access missing afterward.

After analysis, test removing one existing After relationship in a temporary local scenario. See which access disappears, which required access becomes missing, and which affected access survives through another route. The supplied snapshots and reference remain unchanged.

The interface and exported report are in French. The planning documents and these instructions are in English.

## Run locally

Requirements: an installed **Node.js 24** runtime and a browser supporting JavaScript modules and the File API.

From this folder:

```sh
npm start
```

Open **http://127.0.0.1:5174/**. Keep the terminal open; stop the server with Ctrl+C. No `npm install` is required: the project has zero external packages.

If that port is occupied, leave its existing process alone and use:

```sh
node scripts/serve.mjs --port 5175
```

Then open http://127.0.0.1:5175/. Opening `index.html` directly from the filesystem is insufficient because browser modules and the bundled JSON examples use local HTTP.

## Try the complete example

1. Choose **Charger l’exemple** to load the three bundled fictional files.
2. Compare the validated inputs.
3. Inspect Clara’s two gained accesses and Julien’s two lost accesses. Nadia has no access change.
4. Select a result to inspect its representative path. Clara’s path to the renewal plan passes through Support N1 → Support N2 → Pilotage IT; the newly added N1 → N2 membership is marked. Julien’s former membership in N2 is marked as removed.
5. Open the business-reference view. Clara’s access to supplier contracts is not required according to the supplied reference; Julien’s required contract access is missing. Clara’s newly gained renewal-plan access is required and has no reference-deviation row.
6. In the separate simulation panel, select the membership **Support N1 → Support N2** and test its removal. Relative to the current After snapshot, Clara loses both accesses: her non-required contract access disappears, but her required plan access becomes missing. Julien's missing required contract access is listed as already missing, rather than caused by this scenario.
7. Reset the simulation or test a different single relationship. Each test starts from the current After snapshot; removals never accumulate.
8. Export and open `accessdiff-rapport.html`. It contains the original comparison and reference findings, their evidence, input filenames and model limits, followed by a separately labelled simulation section when a current scenario exists.

The fictional hospital IT example contains administrative resources only. It has **3 people, 3 groups, 2 resources**, and two membership edits. The original comparison remains exactly **2 gained + 2 lost** access pairs and **1 unneeded + 1 missing** reference pair. The N1 → N2 removal scenario has **2 losses**, **1 non-required access removed**, **1 newly missing required access**, and **1 required access already missing**.

To use your own data, supply JSON files matching [the input contracts](docs/input-format.md). A supplied invalid reference blocks analysis until fixed or explicitly removed. Replacing any input immediately invalidates earlier results and export, and clears the simulation. Changing/removing the reference or running analysis again also clears the scenario. Reloading starts a new empty session.

## What the result means

- **Gained/lost:** a person can/cannot reach a resource afterward compared with before. These observations do not decide whether the access is appropriate.
- **Not required according to the reference:** an after-access pair is absent from an exhaustive declaration of necessary access. Unchanged access can also have this finding.
- **Required access missing:** a declared necessary pair has no valid granting path afterward.
- **No reference:** business-needs assessment is not performed.
- **No reference deviations:** the supplied data matches that supplied declaration. This is not a security or compliance certification.

All supported paths contribute to effective-access calculation. The screen and report show one shortest representative path, chosen deterministically. Removing one route does not produce a loss when another route still grants access. Missing access cites a reference entry rather than an invented granting path. No relationships are removed automatically, and no particular removal is recommended: a group relationship can also grant required access.

Each selected finding and report brings together actual access Before, actual access After, and the declared need. No reference means **not assessed**; a person/resource removed before After is **outside the scope of that reference**. Both differ from a pair explicitly considered not required. At import, successful reference validation checks its format and scope only. Every omitted pair within that complete scope is declared not required; the author must verify that the declaration reflects the real business needs.

Simulation compares **current After → Scenario**, separately from the original **Before → After** findings. With a reference, it distinguishes non-required access removed, newly missing required access, already missing required access and non-required access remaining. The retained-access list includes only pairs reached through the removed relationship that remain accessible through an alternative path; it is not a list of every unchanged right. Without a reference, losses and retained paths remain observable but business need is **not assessed**. No simulation result certifies that a removal is safe or compliant, and no external permission is changed.

## Model and boundaries

Supported: positive **read** grants to flat resources, granted directly to people or through nested groups. Identifiers are stable identities; display names are labels. Inputs are strictly validated and group cycles are rejected.

This version does not reproduce Windows/Active Directory ACL semantics, deny precedence, filesystem inheritance, write access, conditional grants or live-directory exports. The author must establish that the supplied identities, relationships and business requirements correspond to the intended real system. Reusing an identifier for a different real identity cannot be detected from these snapshots.

Limits: **256 KiB UTF-8 per input**, **100 entities** and **500 total relations per snapshot**, **16 JSON nesting levels**, **2,500 declared requirements**, and **1,000 combined rows** per original analysis. A scenario separately has the same 1,000-row bound across its changes, reference findings and affected retained pairs. Exceeded limits reject that calculation rather than truncate it; a rejected scenario preserves a still-current original analysis. The report can contain both separately bounded results. See [the format documentation](docs/input-format.md) for input validation rules and complete examples.

## Local processing and cost

The Node server binds to **127.0.0.1** and serves only an explicit allowlist of application assets, the bundled fictional examples and the public input-format document. It has no upload or permission-editing API and does not expose planning documents, the learner profile, dotfiles or tests.

File imports, graph traversal, reference evaluation and report creation take place in the browser. Imported data and results stay in page memory; there is no localStorage, database, service worker, telemetry or server-side import storage. Only application assets, bundled example files and the public format documentation can be requested from the local server. A downloaded report is a separate file retained wherever the browser saves it.

There is no runtime AI, external API, account, API key, required hosting, billing account, credit card or service subscription. After obtaining the source and installed runtime, the application runs without an internet connection. Node itself is not bundled or redistributed by this repository.

## Verify

```sh
npm test
```

Uses Node’s built-in test runner, including mathematical access/reference cases, single-removal scenarios and alternative paths, invalid-input boundaries, session freshness, HTML escaping and HTTP allowlist checks. HTTP tests open temporary servers on the loopback address; a restrictive execution sandbox may need to allow those local connections. They do not call an external service.

Browser review should cover the bundled load → compare → explain → reference → simulate/reset → export journey, keyboard navigation, long labels, invalid-file feedback, no-change results, stale result/scenario invalidation, and the absence of imported-data or external network requests.

## Development and submission

AccessDiff is being developed with a coding agent and the Devpost Learn Skill Pack. Its runtime calculations are deterministic JavaScript. The planning artifacts are [scope](devpost/scope.md), [product requirements](devpost/prd.md) and [technical specification](devpost/spec.md); the [build checklist](devpost/checklist.md) records implementation review. The private learner profile is excluded from Git.

The standalone [app map](devpost/app-map.html) connects the removal button, session state and calculation to their actual source files and tests. Open it directly from the local checkout for a compact reference; the application server deliberately does not serve planning artifacts. The map requires no script or external asset.

Suggested under-three-minute English demo:

- State the problem: an apparently small group change can open indirect access or remove access still needed for work.
- Load the example, compare and inspect Clara’s gained plan-access path.
- Inspect Julien’s lost access and its former path.
- Show why a gain can be necessary while another gain is not required; show Julien’s required access missing.
- Test removing Support N1 → Support N2: the same relationship grants Clara both non-required contracts access and required plan access. Show the two effects separately from Julien's already missing right.
- Export the same current evidence, and explain the local processing and explicit model limits.

Public repository creation, video recording and competition submission are separate delivery steps; none is required to run this proof of concept locally. Source license: [MIT](LICENSE).
