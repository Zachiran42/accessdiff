# AccessDiff input format — version 1

AccessDiff accepts two local **UTF-8 JSON snapshots**, explicitly assigned to Before and After, and an optional complete business-reference JSON file. The format describes a small positive-read access model, not a native directory export or Windows ACL format. Unsupported data is rejected as a whole rather than silently ignored.

## Snapshot contract

Every snapshot has exactly these required root fields:

| Field | Value |
| --- | --- |
| `schemaVersion` | Number `1` |
| `people` | Array of `{ "id": string, "name": string }` records |
| `groups` | Array of `{ "id": string, "name": string }` records |
| `resources` | Array of `{ "id": string, "name": string }` records |
| `memberships` | Array of `{ "memberId": string, "groupId": string }` records |
| `grants` | Array of `{ "subjectId": string, "resourceId": string, "permission": "read" }` records |

All listed record properties are required. Extra root or record properties, duplicate JSON object keys (including equivalent decoded keys such as `id` and `\u0069d`), duplicate IDs and duplicate semantic relations are invalid. Arrays may be empty.

### Identities and names

- IDs are case-sensitive and match `[A-Za-z0-9][A-Za-z0-9._:-]{0,63}`: 1–64 ASCII characters beginning with a letter or digit.
- IDs are globally unique among people, groups and resources within each snapshot.
- The same ID must identify the same real entity across snapshots and cannot switch entity type. Do not recycle a deleted person’s ID for a different person. Real-world identity reuse cannot be discovered from these files.
- A renamed person, group or resource with the same ID remains the same identity. Renaming alone creates no access change.
- Names must be nonblank strings of at most **160 UTF-16 code units**. They are labels, not identifiers, paths or executable markup.

### Relationships

`memberId` identifies an existing person or group. `groupId` identifies an existing group. Membership direction is **member → group**, so an N1 → N2 relation means that members of N1 can use N2’s onward memberships and grants.

`subjectId` identifies an existing person or group; `resourceId` identifies an existing resource. The only supported permission is the exact string `read`. A duplicate membership tuple or grant tuple is invalid. Self-membership and group cycles are invalid, including cycles in groups not reached by any person.

A person has effective read access when **any** direct or nested route reaches a resource through a read grant. All supported routes contribute. A path that disappears causes no loss if another route remains. Resources have no hierarchy. There are no deny rules, implicit grants, wildcard permissions, conditional rights or Windows filesystem inheritance in this model.

## Complete Before example

Available as [examples/before.json](../examples/before.json):

```json
{
  "schemaVersion": 1,
  "people": [
    { "id": "p:clara", "name": "Clara" },
    { "id": "p:julien", "name": "Julien" },
    { "id": "p:nadia", "name": "Nadia" }
  ],
  "groups": [
    { "id": "g:support-n1", "name": "Support N1" },
    { "id": "g:support-n2", "name": "Support N2" },
    { "id": "g:pilotage-it", "name": "Pilotage IT" }
  ],
  "resources": [
    { "id": "r:plan-it", "name": "Plan de renouvellement IT" },
    { "id": "r:contrats", "name": "Contrats fournisseurs" }
  ],
  "memberships": [
    { "memberId": "p:nadia", "groupId": "g:pilotage-it" },
    { "memberId": "p:julien", "groupId": "g:support-n2" },
    { "memberId": "g:support-n2", "groupId": "g:pilotage-it" },
    { "memberId": "p:clara", "groupId": "g:support-n1" }
  ],
  "grants": [
    { "subjectId": "g:pilotage-it", "resourceId": "r:plan-it", "permission": "read" },
    { "subjectId": "g:support-n2", "resourceId": "r:contrats", "permission": "read" }
  ]
}
```

## Complete After example

Available as [examples/after.json](../examples/after.json). The only changes are removing Julien → Support N2 and adding Support N1 → Support N2:

```json
{
  "schemaVersion": 1,
  "people": [
    { "id": "p:clara", "name": "Clara" },
    { "id": "p:julien", "name": "Julien" },
    { "id": "p:nadia", "name": "Nadia" }
  ],
  "groups": [
    { "id": "g:support-n1", "name": "Support N1" },
    { "id": "g:support-n2", "name": "Support N2" },
    { "id": "g:pilotage-it", "name": "Pilotage IT" }
  ],
  "resources": [
    { "id": "r:plan-it", "name": "Plan de renouvellement IT" },
    { "id": "r:contrats", "name": "Contrats fournisseurs" }
  ],
  "memberships": [
    { "memberId": "p:nadia", "groupId": "g:pilotage-it" },
    { "memberId": "p:clara", "groupId": "g:support-n1" },
    { "memberId": "g:support-n1", "groupId": "g:support-n2" },
    { "memberId": "g:support-n2", "groupId": "g:pilotage-it" }
  ],
  "grants": [
    { "subjectId": "g:pilotage-it", "resourceId": "r:plan-it", "permission": "read" },
    { "subjectId": "g:support-n2", "resourceId": "r:contrats", "permission": "read" }
  ]
}
```

Expected comparison: Clara gains both resource accesses; Julien loses both; Nadia retains her renewal-plan access. Counts are access **pairs**, not numbers of people. Gained explanations use After labels and routes; lost explanations use Before labels and routes. Removing entities preserves their Before names in a loss explanation.

The engine follows all supported routes but reports one shortest representative path per changed pair. Destination IDs are ordered with deterministic code-unit comparison; array ordering and locale do not choose the evidence. Every changed relationship on the representative route is annotated, along with added/removed entities where relevant. This does not assert that the displayed route was the only route.

## Complete business-reference contract

The optional reference declares necessary read access for **every possible person/resource pair in After**. It must contain exactly these properties and no others:

```json
{
  "schemaVersion": 1,
  "coverage": "all-after-pairs",
  "peopleIds": ["p:clara", "p:julien", "p:nadia"],
  "resourceIds": ["r:plan-it", "r:contrats"],
  "requiredRead": [
    { "personId": "p:nadia", "resourceId": "r:plan-it" },
    { "personId": "p:clara", "resourceId": "r:plan-it" },
    { "personId": "p:julien", "resourceId": "r:contrats" }
  ]
}
```

Available as [examples/required-read.json](../examples/required-read.json), matched to the complete After above.

- `schemaVersion` must be number `1`; `coverage` must be exactly `all-after-pairs`.
- `peopleIds` must exactly match all After people IDs, without duplicates or extras. `resourceIds` must exactly match all After resource IDs. Array order is irrelevant. Groups do not appear in reference coverage.
- `requiredRead` contains only `{ "personId": string, "resourceId": string }` entries. Each entry identifies a covered person and resource. Unknown/deleted IDs, extra properties and duplicate requirement pairs are invalid.
- **Every omitted pair is declared not required.** The reference is exhaustive, not a partial list or a suggestion. An empty `requiredRead` with complete coverage is valid and declares no access necessary.
- There are no group-based requirements, wildcards or default implied rights.
- Coverage and schema are validated mechanically. The author remains responsible for the declared business needs and matching identities. Validation does not certify the business declaration.

Let A be actual effective read-access pairs in After and R the declared necessary pairs:

| Set | Interpretation |
| --- | --- |
| A minus R | Access not required according to this reference; explain with an After path |
| R minus A | Required access missing; cite its zero-based `requiredRead[index]` entry and no After path |
| A intersect R | Required access exists; no reference-deviation finding |

For the bundled example: Clara’s contract access is not required, Julien’s required contract access is missing, and Clara’s gained plan access is necessary. This evaluation is separate from before/after changes; an unchanged access can still be unneeded.

A missing reference means **not assessed**. An invalid supplied reference must be fixed or explicitly removed, and cannot silently become an absent reference. Changing After revalidates coverage. Zero deviations means only that the supplied data matches the supplied reference, not that a real system is secure, compliant or proven to have minimum possible rights. AccessDiff applies no corrections and does not propose automatically removing a relationship that may grant other necessary rights.

## Hard limits

| Limit | Maximum |
| --- | --- |
| Each UTF-8 input | 256 KiB (262,144 bytes) |
| Total people + groups + resources per snapshot | 100 |
| Total memberships + grants per snapshot | 500 |
| Raw JSON nesting depth | 16 |
| `requiredRead` entries | 2,500, also constrained by valid pairs and file size |
| Combined comparison + reference finding rows | 1,000 |

File size is checked before reading a file; encoded text size is also checked by the parser. Exceeding a limit rejects the input or analysis without partial results or a truncated report. Strict JSON syntax, including no comments or trailing commas, is required.

## Lifetime and export

Imported inputs and analysis exist only in the page’s memory. No input contents are uploaded to the static server or stored by the app. An input change immediately invalidates earlier results and disables export; older pending reads cannot replace a newer selection. Reloading requires inputs to be loaded again.

The standalone UTF-8 HTML report contains every current finding, representative paths and changes, reference coverage or not-assessed status, input filenames, generation time and model limits. All imported text is escaped. The report has no scripts or external assets, and printing uses its inline styles. The downloaded file remains wherever the browser saves it, independently of the application session.
