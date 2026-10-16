import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccess } from '../src/access.js';
import { analyzeAccess, evaluateReference, parseReference, validateReference } from '../src/policy.js';

const empty = () => ({ schemaVersion: 1, people: [], groups: [], resources: [], memberships: [], grants: [] });
const entity = (id, name = id) => ({ id, name });
const grant = (subjectId, resourceId) => ({ subjectId, resourceId, permission: 'read' });
const requirement = (personId, resourceId) => ({ personId, resourceId });
const clone = (value) => structuredClone(value);
const referenceFor = (snapshot, requiredRead = []) => ({
  schemaVersion: 1, coverage: 'all-after-pairs', peopleIds: snapshot.people.map(({ id }) => id),
  resourceIds: snapshot.resources.map(({ id }) => id), requiredRead,
});

function example() {
  const before = {
    schemaVersion: 1,
    people: [entity('p:clara', 'Clara'), entity('p:julien', 'Julien'), entity('p:nadia', 'Nadia')],
    groups: [entity('g:support-n1'), entity('g:support-n2'), entity('g:pilotage-it')],
    resources: [entity('r:plan-it', 'Plan de renouvellement IT'), entity('r:contrats', 'Contrats fournisseurs')],
    memberships: [
      { memberId: 'p:nadia', groupId: 'g:pilotage-it' }, { memberId: 'p:julien', groupId: 'g:support-n2' },
      { memberId: 'g:support-n2', groupId: 'g:pilotage-it' }, { memberId: 'p:clara', groupId: 'g:support-n1' },
    ],
    grants: [grant('g:pilotage-it', 'r:plan-it'), grant('g:support-n2', 'r:contrats')],
  };
  const after = clone(before);
  after.memberships = after.memberships.filter(({ memberId }) => memberId !== 'p:julien');
  after.memberships.push({ memberId: 'g:support-n1', groupId: 'g:support-n2' });
  const reference = referenceFor(after, [requirement('p:nadia', 'r:plan-it'), requirement('p:clara', 'r:plan-it'), requirement('p:julien', 'r:contrats')]);
  return { before, after, reference };
}

test('matched business reference identifies precisely one unneeded and one missing access', () => {
  const { before, after, reference } = example();
  const result = analyzeAccess(before, after, reference);
  assert.deepEqual(Object.keys(result).sort(), ['changes', 'counts', 'reference']);
  assert.deepEqual(result.counts, { gained: 2, lost: 2 });
  assert.equal(result.reference.status, 'assessed');
  assert.deepEqual(result.reference.counts, { unneeded: 1, missing: 1 });
  assert.deepEqual(result.reference.coverage, { people: 3, resources: 2, required: 3 });
  assert.deepEqual(result.reference.findings.map(({ kind, person, resource }) => [kind, person.id, resource.id]), [
    ['unneeded', 'p:clara', 'r:contrats'], ['missing', 'p:julien', 'r:contrats'],
  ]);
  assert.ok(result.reference.findings[0].path.edges.length > 0);
  assert.equal(result.reference.findings[1].path, null);
  assert.equal(result.reference.findings[1].referenceEntryIndex, 2);
  assert.equal(result.reference.findings.every(({ snapshot }) => snapshot === 'after'), true);
  assert.deepEqual(result.changes.map(({ person, resource, context }) => [person.id, resource.id, context]), [
    ['p:clara', 'r:contrats', { before: false, after: true, requirement: 'not-required' }],
    ['p:clara', 'r:plan-it', { before: false, after: true, requirement: 'required' }],
    ['p:julien', 'r:contrats', { before: true, after: false, requirement: 'required' }],
    ['p:julien', 'r:plan-it', { before: true, after: false, requirement: 'not-required' }],
  ]);
  assert.deepEqual(result.reference.findings.map(({ context }) => context), [
    { before: false, after: true, requirement: 'not-required' },
    { before: true, after: false, requirement: 'required' },
  ]);
});

test('no reference explicitly means not assessed, including zero differences', () => {
  const snapshot = { ...empty(), people: [entity('p')], resources: [entity('r')], grants: [grant('p', 'r')] };
  assert.deepEqual(analyzeAccess(snapshot, snapshot).reference, {
    status: 'not-assessed', findings: [], counts: { unneeded: 0, missing: 0 }, coverage: null,
  });
});

test('all changed rights carry actual Before/After presence without a business reference', () => {
  const { before, after } = example();
  const result = analyzeAccess(before, after);
  assert.equal(result.changes.length, 4);
  for (const finding of result.changes) {
    assert.deepEqual(finding.context, {
      before: finding.person.id === 'p:julien',
      after: finding.person.id === 'p:clara',
      requirement: 'not-assessed',
    });
  }
});

test('unchanged access can be unneeded and is still explained from After', () => {
  const before = { ...empty(), people: [entity('p', 'Avant')], resources: [entity('r')], grants: [grant('p', 'r')] };
  const after = clone(before);
  after.people[0].name = 'Après';
  const result = analyzeAccess(before, after, referenceFor(after));
  assert.deepEqual(result.changes, []);
  assert.equal(result.reference.findings[0].kind, 'unneeded');
  assert.equal(result.reference.findings[0].person.name, 'Après');
  assert.equal(result.reference.findings[0].path.nodes[0].name, 'Après');
  assert.equal(result.reference.findings[0].path.edges[0].change, null);
  assert.deepEqual(result.reference.findings[0].context, { before: true, after: true, requirement: 'not-required' });
});

test('missing rights distinguish a removed access from one absent in both snapshots', () => {
  const before = {
    ...empty(), people: [entity('p:lost'), entity('p:never')], resources: [entity('r')],
    grants: [grant('p:lost', 'r')],
  };
  const after = { ...clone(before), grants: [] };
  const reference = referenceFor(after, [requirement('p:lost', 'r'), requirement('p:never', 'r')]);
  const result = analyzeAccess(before, after, reference);
  assert.deepEqual(result.reference.findings.map(({ person, context }) => [person.id, context]), [
    ['p:lost', { before: true, after: false, requirement: 'required' }],
    ['p:never', { before: false, after: false, requirement: 'required' }],
  ]);
  assert.equal(result.reference.findings.every(({ path }) => path === null), true);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.changes[0].context, result.reference.findings[0].context);
});

test('removed people and resources fall outside the reference scope for After', async (t) => {
  const before = {
    ...empty(), people: [entity('p:kept'), entity('p:deleted')],
    resources: [entity('r:kept'), entity('r:deleted')],
    grants: [grant('p:kept', 'r:kept'), grant('p:deleted', 'r:kept'), grant('p:kept', 'r:deleted')],
  };
  for (const [name, after, expectedPair] of [
    ['person deleted', {
      ...clone(before), people: [entity('p:kept')], grants: [grant('p:kept', 'r:kept'), grant('p:kept', 'r:deleted')],
    }, ['p:deleted', 'r:kept']],
    ['resource deleted', {
      ...clone(before), resources: [entity('r:kept')], grants: [grant('p:kept', 'r:kept'), grant('p:deleted', 'r:kept')],
    }, ['p:kept', 'r:deleted']],
  ]) await t.test(name, () => {
    const reference = referenceFor(after, after.grants.map(({ subjectId, resourceId }) => requirement(subjectId, resourceId)));
    const result = analyzeAccess(before, after, reference);
    assert.equal(result.changes.length, 1);
    const finding = result.changes[0];
    assert.deepEqual([finding.person.id, finding.resource.id], expectedPair);
    assert.deepEqual(finding.context, { before: true, after: false, requirement: 'out-of-scope' });
    assert.deepEqual(result.reference.findings, []);
    assert.deepEqual(analyzeAccess(before, after).changes[0].context, {
      before: true, after: false, requirement: 'not-assessed',
    });
  });
});

test('required missing access references its actual declaration and has no fabricated path', () => {
  const after = { ...empty(), people: [entity('p')], resources: [entity('r')] };
  const result = evaluateReference(referenceFor(after, [requirement('p', 'r')]), after, computeAccess(after));
  assert.deepEqual(result.counts, { unneeded: 0, missing: 1 });
  assert.equal(result.findings[0].referenceEntryIndex, 0);
  assert.equal(result.findings[0].path, null);
  assert.equal(Object.hasOwn(result.findings[0], 'context'), false);
});

test('exact required/actual intersection has no deviations without inventing a verdict', () => {
  const after = { ...empty(), people: [entity('p')], resources: [entity('r')], grants: [grant('p', 'r')] };
  const assessment = evaluateReference(referenceFor(after, [requirement('p', 'r')]), after);
  assert.deepEqual(assessment.findings, []);
  assert.deepEqual(assessment.counts, { unneeded: 0, missing: 0 });
  assert.equal(assessment.status, 'assessed');
  assert.deepEqual(Object.keys(assessment).sort(), ['counts', 'coverage', 'findings', 'status']);
});

test('empty complete reference is valid, including a completely empty After', () => {
  assert.deepEqual(evaluateReference(referenceFor(empty()), empty()).coverage, { people: 0, resources: 0, required: 0 });
  const after = { ...empty(), people: [entity('p')], resources: [entity('r')] };
  assert.doesNotThrow(() => validateReference(referenceFor(after), after));
});

test('coverage must exactly match After, including non-required people and resources', async (t) => {
  const after = { ...empty(), people: [entity('p1'), entity('p2')], resources: [entity('r1'), entity('r2')] };
  for (const [name, mutate] of [
    ['missing person', (r) => r.peopleIds.pop()], ['extra person', (r) => r.peopleIds.push('deleted')],
    ['missing resource', (r) => r.resourceIds.pop()], ['extra resource', (r) => r.resourceIds.push('deleted')],
    ['changed type in declared population', (r) => { r.peopleIds[0] = 'r1'; }],
  ]) await t.test(name, () => {
    const reference = referenceFor(after);
    mutate(reference);
    assert.throws(() => validateReference(reference, after), { code: 'REFERENCE_COVERAGE' });
  });
});

test('a supplied invalid reference cannot be silently ignored', () => {
  const { before, after, reference } = example();
  reference.coverage = 'partial';
  assert.throws(() => analyzeAccess(before, after, reference), { code: 'INVALID_REFERENCE' });
  assert.throws(() => analyzeAccess(before, after, false), { code: 'INVALID_REFERENCE' });
});

test('reference strict reader rejects malformed JSON and decoded duplicate keys', () => {
  assert.throws(() => parseReference('{'), { code: 'INVALID_JSON' });
  assert.throws(() => parseReference('{"coverage":"all-after-pairs","\\u0063overage":"all-after-pairs"}'), { code: 'DUPLICATE_JSON_KEY' });
  assert.throws(() => parseReference('{}', { label: 'Référence métier' }), /Référence métier.*schemaVersion/);
});

test('reference rejects unsupported shape, duplicate IDs/pairs and unknown requirements', async (t) => {
  const after = { ...empty(), people: [entity('p')], resources: [entity('r')] };
  const base = referenceFor(after, [requirement('p', 'r')]);
  const cases = [
    ['unknown root property', (r) => { r.note = 'comment'; }],
    ['missing root property', (r) => { delete r.coverage; }],
    ['schema version', (r) => { r.schemaVersion = 2; }],
    ['nonarray people', (r) => { r.peopleIds = 'p'; }],
    ['duplicate person', (r) => { r.peopleIds.push('p'); }],
    ['duplicate resource', (r) => { r.resourceIds.push('r'); }],
    ['invalid identifier', (r) => { r.peopleIds[0] = 'p\n'; }],
    ['nonarray requirements', (r) => { r.requiredRead = {}; }],
    ['requirement unknown property', (r) => { r.requiredRead[0].permission = 'read'; }],
    ['requirement missing property', (r) => { delete r.requiredRead[0].resourceId; }],
    ['requirement unknown person', (r) => { r.requiredRead[0].personId = 'unknown'; }],
    ['requirement unknown resource', (r) => { r.requiredRead[0].resourceId = 'unknown'; }],
    ['duplicate requirement', (r) => { r.requiredRead.push(requirement('p', 'r')); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const invalid = clone(base);
    mutate(invalid);
    assert.throws(() => parseReference(JSON.stringify(invalid)), { code: 'INVALID_REFERENCE' });
  });
});

test('the requirement-entry limit is enforced before producing assessment rows', () => {
  const after = { ...empty(), people: [entity('p')], resources: [entity('r')] };
  const reference = referenceFor(after, Array.from({ length: 2501 }, () => requirement('p', 'r')));
  assert.throws(() => validateReference(reference, after), { code: 'REQUIREMENT_LIMIT' });
});

function manyAccesses(peopleCount = 20) {
  const after = { ...empty(), people: Array.from({ length: peopleCount }, (_, i) => entity(`p${i}`)),
    groups: [entity('g')], resources: Array.from({ length: 50 }, (_, i) => entity(`r${i}`)) };
  after.memberships = after.people.map(({ id }) => ({ memberId: id, groupId: 'g' }));
  after.grants = after.resources.map(({ id }) => grant('g', id));
  const before = clone(after);
  before.memberships = [];
  return { before, after };
}

test('the inclusive 1,000-row result boundary is accepted', () => {
  const { before, after } = manyAccesses();
  assert.equal(analyzeAccess(before, after).changes.length, 1000);
  assert.equal(analyzeAccess(after, after, referenceFor(after)).reference.findings.length, 1000);
});

test('combined difference and reference rows enforce one shared limit without partial output', () => {
  const { before, after } = manyAccesses();
  assert.throws(() => analyzeAccess(before, after, referenceFor(after)), (error) => {
    assert.equal(error.code, 'RESULT_LIMIT');
    assert.match(error.message, /Aucun résultat partiel/);
    assert.equal(Object.hasOwn(error, 'result'), false);
    return true;
  });
  const larger = manyAccesses(21);
  assert.throws(() => analyzeAccess(larger.before, larger.after), { code: 'RESULT_LIMIT' });
});

test('reference finding order ignores source array order, while declaration indices stay accurate', () => {
  const after = { ...empty(), people: [entity('pB'), entity('pA')], resources: [entity('rB'), entity('rA')],
    grants: [grant('pB', 'rB')] };
  const reference = referenceFor(after, [requirement('pB', 'rA'), requirement('pA', 'rB')]);
  const assessment = evaluateReference(reference, after);
  assert.deepEqual(assessment.findings.map(({ person, resource, kind, referenceEntryIndex }) => [person.id, resource.id, kind, referenceEntryIndex]), [
    ['pA', 'rB', 'missing', 1], ['pB', 'rA', 'missing', 0], ['pB', 'rB', 'unneeded', undefined],
  ]);
});
