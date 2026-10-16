import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeAccess } from '../src/access.js';
import { listRemovableRelations, simulateRemoval } from '../src/simulation.js';

const entity = id => ({ id, name: id });
const membership = (memberId, groupId) => ({ memberId, groupId });
const grant = (subjectId, resourceId) => ({ subjectId, resourceId, permission: 'read' });
const pairKey = (personId, resourceId) => JSON.stringify([personId, resourceId]);
const relationKey = edge => JSON.stringify([edge.kind, edge.fromId, edge.toId, edge.permission ?? null]);
const empty = () => ({ schemaVersion: 1, people: [], groups: [], resources: [], memberships: [], grants: [] });
const referenceFor = (snapshot, requiredRead = []) => ({
  schemaVersion: 1, coverage: 'all-after-pairs', peopleIds: snapshot.people.map(({ id }) => id),
  resourceIds: snapshot.resources.map(({ id }) => id), requiredRead,
});
const findRelation = (snapshot, kind, from, to) => listRemovableRelations(snapshot)
  .find(relation => relation.kind === kind && relation.from.id === from && relation.to.id === to);

function alternativeRoutes() {
  return {
    ...empty(), people: [entity('p:a'), entity('p:unrelated')],
    groups: [entity('g:a'), entity('g:b'), entity('g:merge')],
    resources: [entity('r:a'), entity('r:unrelated')],
    memberships: [membership('p:a', 'g:a'), membership('p:a', 'g:b'), membership('g:a', 'g:merge'), membership('g:b', 'g:merge')],
    grants: [grant('g:merge', 'r:a'), grant('p:unrelated', 'r:unrelated')],
  };
}

test('hospital example distinguishes the removed unneeded access, newly missing need, and pre-existing missing need', async () => {
  const after = JSON.parse(await readFile(new URL('../examples/after.json', import.meta.url), 'utf8'));
  const reference = JSON.parse(await readFile(new URL('../examples/required-read.json', import.meta.url), 'utf8'));
  const original = structuredClone({ after, reference });
  const relation = findRelation(after, 'membership', 'g:support-n1', 'g:support-n2');
  const result = simulateRemoval(after, reference, relation.id);
  assert.deepEqual(result.counts, { gained: 0, lost: 2 });
  assert.deepEqual(result.impact, {
    status: 'assessed', removedUnneeded: 1, newlyMissing: 1, alreadyMissing: 1, remainingUnneeded: 0,
  });
  assert.deepEqual(result.changes.map(finding => [finding.person.id, finding.resource.id, finding.context]), [
    ['p:clara', 'r:contrats', { before: true, after: false, requirement: 'not-required' }],
    ['p:clara', 'r:plan-it', { before: true, after: false, requirement: 'required' }],
  ]);
  assert.deepEqual(result.reference.findings.map(finding => [finding.person.id, finding.context.before]), [
    ['p:clara', true], ['p:julien', false],
  ]);
  assert.deepEqual(result.retained, []);
  for (const finding of result.changes) {
    const removed = finding.path.edges.filter(edge => edge.change === 'removed');
    assert.equal(removed.length, 1);
    assert.equal(relationKey(removed[0]), relation.id);
  }
  assert.deepEqual({ after, reference }, original);
});

test('relation identities and ordering are stable across input order, with copied typed labels', () => {
  const after = alternativeRoutes();
  const relations = listRemovableRelations(after);
  const reordered = structuredClone(after);
  for (const field of ['people', 'groups', 'resources', 'memberships', 'grants']) reordered[field].reverse();
  assert.deepEqual(listRemovableRelations(reordered), relations);
  assert.deepEqual(findRelation(after, 'membership', 'p:a', 'g:a').from, { id: 'p:a', name: 'p:a', kind: 'person' });
  assert.equal(findRelation(after, 'grant', 'g:merge', 'r:a').permission, 'read');
  relations[0].from.name = 'Changed externally';
  assert.equal(after.groups.find(group => group.id === 'g:merge').name, 'g:merge');
});

test('removing a direct grant preserves other rights and reports a retained indirect route', () => {
  const after = {
    ...empty(), people: [entity('p')], groups: [entity('g')], resources: [entity('r'), entity('r:other')],
    memberships: [membership('p', 'g')], grants: [grant('p', 'r'), grant('g', 'r'), grant('p', 'r:other')],
  };
  const reference = referenceFor(after, [{ personId: 'p', resourceId: 'r' }]);
  const result = simulateRemoval(after, reference, findRelation(after, 'grant', 'p', 'r').id);
  assert.deepEqual(result.counts, { gained: 0, lost: 0 });
  assert.deepEqual(result.retained.map(finding => [finding.person.id, finding.resource.id]), [['p', 'r']]);
  assert.deepEqual(result.retained[0].path.nodes.map(node => node.id), ['p', 'g', 'r']);
  assert.deepEqual(result.retained[0].context, { before: true, after: true, requirement: 'required' });
  assert.deepEqual(result.impact, { status: 'assessed', removedUnneeded: 0, newlyMissing: 0, alreadyMissing: 0, remainingUnneeded: 1 });
});

test('retained includes a route affected outside the representative path and excludes unrelated unchanged pairs', () => {
  const after = alternativeRoutes();
  assert.deepEqual(computeAccess(after).get('p:a').get('r:a').nodes.map(node => node.id), ['p:a', 'g:a', 'g:merge', 'r:a']);
  const relation = findRelation(after, 'membership', 'g:b', 'g:merge');
  const result = simulateRemoval(after, referenceFor(after), relation.id);
  assert.deepEqual(result.counts, { gained: 0, lost: 0 });
  assert.deepEqual(result.retained.map(finding => [finding.person.id, finding.resource.id]), [['p:a', 'r:a']]);
  assert.deepEqual(result.retained[0].context, { before: true, after: true, requirement: 'not-required' });
  assert.ok(result.retained[0].path.edges.every(edge => relationKey(edge) !== relation.id));
});

test('sharing the relation endpoints through separate routes does not prove a route uses the removed edge', () => {
  const after = {
    ...empty(), people: [entity('p')], groups: [entity('g:a'), entity('g:b')], resources: [entity('r')],
    memberships: [membership('p', 'g:a'), membership('p', 'g:b'), membership('g:a', 'g:b')],
    grants: [grant('g:a', 'r')],
  };
  const result = simulateRemoval(after, null, findRelation(after, 'membership', 'g:a', 'g:b').id);
  assert.deepEqual(result.counts, { gained: 0, lost: 0 });
  assert.deepEqual(result.retained, []);
});

test('without a reference access consequences remain calculable but business impact is explicitly unassessed', () => {
  const after = alternativeRoutes();
  const retained = simulateRemoval(after, null, findRelation(after, 'membership', 'p:a', 'g:b').id);
  assert.deepEqual(retained.impact, {
    status: 'not-assessed', removedUnneeded: null, newlyMissing: null, alreadyMissing: null, remainingUnneeded: null,
  });
  assert.equal(retained.retained[0].context.requirement, 'not-assessed');
  const lost = simulateRemoval(after, null, findRelation(after, 'grant', 'g:merge', 'r:a').id);
  assert.deepEqual(lost.changes[0].context, { before: true, after: false, requirement: 'not-assessed' });
  assert.equal(lost.reference.status, 'not-assessed');
});

test('every request starts from the original After and output cannot mutate supplied evidence', () => {
  const after = alternativeRoutes();
  const original = structuredClone(after);
  const firstRelation = findRelation(after, 'membership', 'p:a', 'g:a');
  const secondRelation = findRelation(after, 'membership', 'p:a', 'g:b');
  const first = simulateRemoval(after, null, firstRelation.id);
  const second = simulateRemoval(after, null, secondRelation.id);
  assert.equal(first.retained.length, 1);
  assert.equal(second.retained.length, 1);
  assert.equal(second.counts.lost, 0);
  first.retained[0].path.nodes[0].name = 'Changed result label';
  first.relation.from.name = 'Changed relation label';
  assert.deepEqual(after, original);
  assert.equal(second.retained[0].path.nodes[0].name, 'p:a');
});

test('invalid relations, unsupported input and mismatched references fail without a result', () => {
  const after = alternativeRoutes();
  const relation = listRemovableRelations(after)[0];
  for (const id of [null, undefined, 3, {}, '', '["membership","unknown","unknown",null]', `${relation.id} `]) {
    assert.throws(() => simulateRemoval(after, null, id), error => error.code === 'INVALID_RELATION');
  }
  const invalid = structuredClone(after);
  invalid.memberships.push(membership('g:merge', 'g:a'));
  assert.throws(() => listRemovableRelations(invalid), error => error.code === 'GROUP_CYCLE');
  assert.throws(() => simulateRemoval(invalid, null, relation.id), error => error.code === 'GROUP_CYCLE');
  const reference = referenceFor(after);
  reference.peopleIds.pop();
  assert.throws(() => simulateRemoval(after, reference, relation.id), error => error.code === 'REFERENCE_COVERAGE');
  assert.throws(() => simulateRemoval(after, { ...referenceFor(after), unknown: true }, relation.id), /champ non pris en charge/);
});

function manyRetained(peopleCount, resourceCount) {
  const people = Array.from({ length: peopleCount }, (_, i) => entity(`p:${i}`));
  const resources = Array.from({ length: resourceCount }, (_, i) => entity(`r:${i}`));
  return {
    ...empty(), people, resources, groups: [entity('g:a'), entity('g:b')],
    memberships: [...people.flatMap(person => [membership(person.id, 'g:a'), membership(person.id, 'g:b')]), membership('g:a', 'g:b')],
    grants: resources.map(resource => grant('g:b', resource.id)),
  };
}

test('the 1,000-row budget includes retained routes and scenario reference findings without truncation', () => {
  const boundary = manyRetained(20, 50);
  const relation = findRelation(boundary, 'membership', 'g:a', 'g:b');
  const result = simulateRemoval(boundary, null, relation.id);
  assert.equal(result.retained.length, 1000);
  const requiredRead = boundary.people.flatMap(person => boundary.resources.map(resource => ({ personId: person.id, resourceId: resource.id })));
  assert.equal(simulateRemoval(boundary, referenceFor(boundary, requiredRead), relation.id).retained.length, 1000);
  requiredRead.pop();
  assert.throws(() => simulateRemoval(boundary, referenceFor(boundary, requiredRead), relation.id), error => error.code === 'RESULT_LIMIT');
  const tooMany = manyRetained(21, 48);
  assert.throws(() => simulateRemoval(tooMany, null, findRelation(tooMany, 'membership', 'g:a', 'g:b').id), error => error.code === 'RESULT_LIMIT');
  assert.equal(boundary.memberships.length, 41);
});

// Independent oracle enumerates all acyclic routes rather than using the
// production reachability/BFS implementation or its representative paths.
function allRoutes(snapshot) {
  const edges = [
    ...snapshot.memberships.map(edge => ({ kind: 'membership', fromId: edge.memberId, toId: edge.groupId })),
    ...snapshot.grants.map(edge => ({ kind: 'grant', fromId: edge.subjectId, toId: edge.resourceId, permission: edge.permission })),
  ];
  const resourceIds = new Set(snapshot.resources.map(resource => resource.id));
  const routes = new Map();
  for (const person of snapshot.people) {
    function visit(id, path) {
      if (resourceIds.has(id)) {
        const key = pairKey(person.id, id);
        if (!routes.has(key)) routes.set(key, []);
        routes.get(key).push(path);
      }
      for (const edge of edges.filter(edge => edge.fromId === id)) visit(edge.toId, [...path, relationKey(edge)]);
    }
    visit(person.id, []);
  }
  return routes;
}

test('32 generated DAGs agree with independent all-route enumeration for every removable relation', () => {
  for (let seed = 1; seed <= 32; seed += 1) {
    let state = seed;
    const pick = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 < 0.45; };
    const after = { ...empty(), people: [entity('p:0'), entity('p:1')], groups: [entity('g:0'), entity('g:1'), entity('g:2')], resources: [entity('r:0'), entity('r:1')] };
    for (const person of after.people) for (const group of after.groups) if (pick()) after.memberships.push(membership(person.id, group.id));
    for (let i = 0; i < after.groups.length; i += 1) for (let j = i + 1; j < after.groups.length; j += 1) if (pick()) after.memberships.push(membership(after.groups[i].id, after.groups[j].id));
    for (const subject of [...after.people, ...after.groups]) for (const resource of after.resources) if (pick()) after.grants.push(grant(subject.id, resource.id));
    const routes = allRoutes(after);
    for (const relation of listRemovableRelations(after)) {
      const keptPairs = new Set([...routes].filter(([, paths]) => paths.some(path => !path.includes(relation.id))).map(([key]) => key));
      const affectedPairs = new Set([...routes].filter(([, paths]) => paths.some(path => path.includes(relation.id))).map(([key]) => key));
      const result = simulateRemoval(after, null, relation.id);
      const actualPairs = findings => findings.map(finding => pairKey(finding.person.id, finding.resource.id)).sort();
      assert.deepEqual(actualPairs(result.changes), [...routes.keys()].filter(key => !keptPairs.has(key)).sort(), `seed ${seed}, removed ${relation.id}: losses`);
      assert.deepEqual(actualPairs(result.retained), [...affectedPairs].filter(key => keptPairs.has(key)).sort(), `seed ${seed}, removed ${relation.id}: retained`);
      assert.equal(result.counts.gained, 0);
      for (const finding of result.retained) assert.ok(finding.path.edges.every(edge => relationKey(edge) !== relation.id));
    }
  }
});
