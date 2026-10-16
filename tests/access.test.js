import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrictJson } from '../src/json.js';
import { parseSnapshot, validateSnapshot } from '../src/snapshot.js';
import { computeAccess, compareSnapshots } from '../src/access.js';

const empty = () => ({ schemaVersion: 1, people: [], groups: [], resources: [], memberships: [], grants: [] });
const person = (id, name = id) => ({ id, name });
const membership = (memberId, groupId) => ({ memberId, groupId });
const grant = (subjectId, resourceId) => ({ subjectId, resourceId, permission: 'read' });
const clone = (value) => structuredClone(value);

function example() {
  const before = {
    schemaVersion: 1,
    people: [person('p:clara', 'Clara'), person('p:julien', 'Julien'), person('p:nadia', 'Nadia')],
    groups: [person('g:support-n1', 'Support N1'), person('g:support-n2', 'Support N2'), person('g:pilotage-it', 'Pilotage IT')],
    resources: [person('r:plan-it', 'Plan de renouvellement IT'), person('r:contrats', 'Contrats fournisseurs')],
    memberships: [membership('p:nadia', 'g:pilotage-it'), membership('p:julien', 'g:support-n2'), membership('g:support-n2', 'g:pilotage-it'), membership('p:clara', 'g:support-n1')],
    grants: [grant('g:pilotage-it', 'r:plan-it'), grant('g:support-n2', 'r:contrats')],
  };
  const after = clone(before);
  after.memberships = after.memberships.filter(({ memberId }) => memberId !== 'p:julien');
  after.memberships.push(membership('g:support-n1', 'g:support-n2'));
  return { before, after };
}

test('the fictional example yields precisely Clara’s two gains and Julien’s two losses', () => {
  const { before, after } = example();
  const result = compareSnapshots(before, after);
  assert.deepEqual(result.counts, { gained: 2, lost: 2 });
  assert.deepEqual(result.changes.map(({ kind, person, resource }) => [kind, person.id, resource.id]), [
    ['gained', 'p:clara', 'r:contrats'], ['gained', 'p:clara', 'r:plan-it'],
    ['lost', 'p:julien', 'r:contrats'], ['lost', 'p:julien', 'r:plan-it'],
  ]);
  for (const finding of result.changes) {
    assert.equal(finding.snapshot, finding.kind === 'gained' ? 'after' : 'before');
    assert.equal(finding.path.nodes[0].id, finding.person.id);
    assert.equal(finding.path.nodes.at(-1).id, finding.resource.id);
    assert.equal(finding.path.edges.filter(({ change }) => change !== null).length, 1);
  }
  assert.deepEqual(result.afterAccess.get('p:nadia').keys().toArray(), ['r:plan-it']);
});

test('another nested route prevents a false loss when the representative route disappears', () => {
  const before = { ...empty(), people: [person('p')], groups: [person('gA'), person('gB'), person('gC')], resources: [person('r')],
    memberships: [membership('p', 'gA'), membership('p', 'gB'), membership('gB', 'gC')],
    grants: [grant('gA', 'r'), grant('gC', 'r')] };
  assert.deepEqual(computeAccess(before).get('p').get('r').nodes.map(({ id }) => id), ['p', 'gA', 'r']);
  const after = clone(before);
  after.memberships.shift();
  assert.deepEqual(compareSnapshots(before, after).changes, []);
  assert.deepEqual(computeAccess(after).get('p').get('r').nodes.map(({ id }) => id), ['p', 'gB', 'gC', 'r']);
});

test('removing a direct grant preserves access through a remaining group', () => {
  const before = { ...empty(), people: [person('p')], groups: [person('g')], resources: [person('r')],
    memberships: [membership('p', 'g')], grants: [grant('p', 'r'), grant('g', 'r')] };
  assert.equal(computeAccess(before).get('p').get('r').edges.length, 1);
  const after = clone(before);
  after.grants.shift();
  assert.deepEqual(compareSnapshots(before, after).counts, { gained: 0, lost: 0 });
});

test('all changed relationships are annotated and new entities are identified', () => {
  const before = { ...empty(), people: [person('p')], groups: [person('gA')], resources: [person('r')] };
  const after = { ...clone(before), groups: [person('gA'), person('gB')],
    memberships: [membership('p', 'gA'), membership('gA', 'gB')], grants: [grant('gB', 'r')] };
  const [finding] = compareSnapshots(before, after).changes;
  assert.deepEqual(finding.path.edges.map(({ change }) => change), ['added', 'added', 'added']);
  assert.deepEqual(finding.path.nodes.map(({ change }) => change), [null, null, 'added', null]);
  const [loss] = compareSnapshots(after, before).changes;
  assert.deepEqual(loss.path.edges.map(({ change }) => change), ['removed', 'removed', 'removed']);
  assert.equal(loss.path.nodes.find(({ id }) => id === 'gB').change, 'removed');
});

test('permuted input chooses the same shortest path using code-unit ID order', () => {
  const source = { ...empty(), people: [person('p')], groups: [person('g:a'), person('g:Z')], resources: [person('r')],
    memberships: [membership('p', 'g:a'), membership('p', 'g:Z')], grants: [grant('g:a', 'r'), grant('g:Z', 'r')] };
  const reversed = clone(source);
  for (const field of ['people', 'groups', 'resources', 'memberships', 'grants']) reversed[field].reverse();
  assert.deepEqual(computeAccess(source), computeAccess(reversed));
  assert.deepEqual(computeAccess(source).get('p').get('r').nodes.map(({ id }) => id), ['p', 'g:Z', 'r']);
});

test('renaming labels does not change access; a loss retains all Before labels', () => {
  const before = { ...empty(), people: [person('p', 'Personne avant')], groups: [person('g', 'Groupe avant')], resources: [person('r', 'Dossier avant')],
    memberships: [membership('p', 'g')], grants: [grant('g', 'r')] };
  const after = clone(before);
  after.people[0].name = 'Personne après';
  after.groups[0].name = 'Groupe après';
  after.resources[0].name = 'Dossier après';
  assert.equal(compareSnapshots(before, after).changes.length, 0);
  after.grants = [];
  const [loss] = compareSnapshots(before, after).changes;
  assert.equal(loss.person.name, 'Personne avant');
  assert.equal(loss.resource.name, 'Dossier avant');
  assert.deepEqual(loss.path.nodes.map(({ name }) => name), ['Personne avant', 'Groupe avant', 'Dossier avant']);
});

test('deleting a person or resource yields an explained loss with the removed entity marked', () => {
  const before = { ...empty(), people: [person('p')], resources: [person('r')], grants: [grant('p', 'r')] };
  const noPerson = { ...empty(), resources: [person('r')] };
  const noResource = { ...empty(), people: [person('p')] };
  const personLoss = compareSnapshots(before, noPerson).changes[0];
  const resourceLoss = compareSnapshots(before, noResource).changes[0];
  assert.equal(personLoss.path.nodes[0].change, 'removed');
  assert.equal(resourceLoss.path.nodes.at(-1).change, 'removed');
  assert.equal(resourceLoss.path.edges[0].change, 'removed');
});

test('stable IDs cannot change entity type across snapshots', () => {
  const before = { ...empty(), groups: [person('stable')] };
  const after = { ...empty(), people: [person('stable')] };
  assert.throws(() => compareSnapshots(before, after), { code: 'ENTITY_TYPE_CHANGED' });
});

test('semantic tuples remain distinct with delimiter-like IDs', () => {
  const snapshot = { ...empty(), people: [person('a:b'), person('a')], groups: [person('b:c'), person('c')], resources: [person('r')],
    memberships: [membership('a:b', 'c'), membership('a', 'b:c')], grants: [grant('c', 'r'), grant('b:c', 'r')] };
  assert.equal(computeAccess(snapshot).get('a:b').has('r'), true);
  assert.equal(computeAccess(snapshot).get('a').has('r'), true);
});

test('Maps safely support object-prototype-like identifiers', () => {
  const snapshot = { ...empty(), people: [person('constructor')], groups: [person('__proto__')], resources: [person('toString')],
    memberships: [membership('constructor', '__proto__')], grants: [grant('__proto__', 'toString')] };
  // IDs must start with a letter or digit; the example intentionally tests rejection first.
  assert.throws(() => validateSnapshot(snapshot), /identifiant invalide/);
  snapshot.groups[0].id = 'g:__proto__';
  snapshot.memberships[0].groupId = 'g:__proto__';
  snapshot.grants[0].subjectId = 'g:__proto__';
  assert.equal(computeAccess(snapshot).get('constructor').has('toString'), true);
});

test('parseSnapshot returns validated JSON directly and preserves labels', () => {
  const snapshot = { ...empty(), people: [person('P:Case', '  Nom conservé  ')] };
  assert.deepEqual(parseSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.throws(() => parseSnapshot('{"schemaVersion":2}', { label: 'Avant' }), /Avant.*champ obligatoire/);
});

test('strict JSON rejects decoded duplicate keys at every object depth', () => {
  for (const text of ['{"id":1,"\\u0069d":2}', '{"nested":[{"a":1,"a":2}]}', '{"__proto__":1,"\\u005f_proto__":2}']) {
    assert.throws(() => parseStrictJson(text), { code: 'DUPLICATE_JSON_KEY' });
  }
  assert.deepEqual(parseStrictJson('{"text":"\\\"a\\\":1,\\\"a\\\":2", "nested":{"a":1},"a":2}'), {
    text: '"a":1,"a":2', nested: { a: 1 }, a: 2,
  });
});

test('strict JSON counts UTF-8 bytes and enforces the exact nesting boundary', () => {
  assert.equal(parseStrictJson('"' + 'x'.repeat(256 * 1024 - 2) + '"').length, 256 * 1024 - 2);
  assert.throws(() => parseStrictJson('"' + 'é'.repeat(131072) + '"'), { code: 'INPUT_SIZE_LIMIT' });
  assert.doesNotThrow(() => parseStrictJson('['.repeat(16) + '0' + ']'.repeat(16)));
  assert.throws(() => parseStrictJson('['.repeat(17) + '0' + ']'.repeat(17)), { code: 'INPUT_DEPTH_LIMIT' });
  assert.throws(() => parseStrictJson('{"broken":}'), { code: 'INVALID_JSON' });
  assert.throws(() => parseStrictJson(null), { code: 'INVALID_JSON' });
});

test('snapshot validation rejects exact-shape, unsupported-semantic and identity failures', async (t) => {
  const base = { ...empty(), people: [person('p')], groups: [person('g')], resources: [person('r')], memberships: [membership('p', 'g')], grants: [grant('g', 'r')] };
  const cases = [
    ['unknown root field', (s) => { s.extra = true; }],
    ['missing root field', (s) => { delete s.groups; }],
    ['nonarray collection', (s) => { s.people = {}; }],
    ['schema version', (s) => { s.schemaVersion = '1'; }],
    ['unknown entity property', (s) => { s.people[0].role = 'admin'; }],
    ['duplicate global ID', (s) => { s.groups[0].id = 'p'; }],
    ['blank name', (s) => { s.people[0].name = ' \t'; }],
    ['long UTF-16 name', (s) => { s.people[0].name = '😀'.repeat(81); }],
    ['trailing newline ID', (s) => { s.people[0].id = 'p\n'; }],
    ['long ID', (s) => { s.people[0].id = 'p'.repeat(65); }],
    ['unknown member', (s) => { s.memberships[0].memberId = 'missing'; }],
    ['resource as member', (s) => { s.memberships[0].memberId = 'r'; }],
    ['person as membership target', (s) => { s.memberships[0].groupId = 'p'; }],
    ['duplicate membership', (s) => { s.memberships.push(clone(s.memberships[0])); }],
    ['unknown grant property', (s) => { s.grants[0].deny = true; }],
    ['resource as grant subject', (s) => { s.grants[0].subjectId = 'r'; }],
    ['group as resource target', (s) => { s.grants[0].resourceId = 'g'; }],
    ['unknown grant target', (s) => { s.grants[0].resourceId = 'missing'; }],
    ['write permission', (s) => { s.grants[0].permission = 'write'; }],
    ['duplicate grant', (s) => { s.grants.push(clone(s.grants[0])); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const invalid = clone(base);
    mutate(invalid);
    assert.throws(() => validateSnapshot(invalid), (error) => error.code === 'INVALID_SNAPSHOT' && typeof error.path === 'string');
  });
});

test('unused group cycles and self-membership are rejected', () => {
  const cycle = { ...empty(), groups: [person('gA'), person('gB'), person('gC')],
    memberships: [membership('gA', 'gB'), membership('gB', 'gC'), membership('gC', 'gA')] };
  assert.throws(() => validateSnapshot(cycle), { code: 'GROUP_CYCLE' });
  const self = { ...empty(), groups: [person('g')], memberships: [membership('g', 'g')] };
  assert.throws(() => validateSnapshot(self), { code: 'GROUP_CYCLE' });
});

test('input entity/relation limits apply to combined totals', () => {
  const entities = { ...empty(), people: Array.from({ length: 100 }, (_, i) => person(`p${i}`)) };
  assert.doesNotThrow(() => validateSnapshot(entities));
  entities.resources.push(person('r'));
  assert.throws(() => validateSnapshot(entities), { code: 'ENTITY_LIMIT' });
  const relations = { ...empty(), people: [person('p')], groups: [person('g')], memberships: Array.from({ length: 501 }, () => membership('p', 'g')) };
  assert.throws(() => validateSnapshot(relations), { code: 'RELATION_LIMIT' });
});

test('comparison never mutates imported snapshots', () => {
  const { before, after } = example();
  const saved = JSON.stringify([before, after]);
  compareSnapshots(before, after);
  assert.equal(JSON.stringify([before, after]), saved);
});
