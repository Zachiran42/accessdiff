import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot } from '../src/snapshot.js';
import { compareSnapshots } from '../src/access.js';
import { analyzeAccess } from '../src/policy.js';

// Independent oracle: transitive closure of a boolean matrix, not the engine's
// breadth-first search or its predecessor/path implementation.
function closureAccess(snapshot) {
  const entities = [...snapshot.people, ...snapshot.groups, ...snapshot.resources];
  const index = new Map(entities.map((entity, i) => [entity.id, i]));
  const reachable = entities.map((_, i) => entities.map((__, j) => i === j));
  for (const edge of snapshot.memberships) reachable[index.get(edge.memberId)][index.get(edge.groupId)] = true;
  for (const edge of snapshot.grants) reachable[index.get(edge.subjectId)][index.get(edge.resourceId)] = true;
  for (let k = 0; k < entities.length; k++) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = 0; j < entities.length; j++) {
        reachable[i][j] ||= reachable[i][k] && reachable[k][j];
      }
    }
  }
  const pairs = new Set();
  for (const person of snapshot.people) {
    for (const resource of snapshot.resources) {
      if (reachable[index.get(person.id)][index.get(resource.id)]) pairs.add(JSON.stringify([person.id, resource.id]));
    }
  }
  return pairs;
}

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sampleSnapshot(next, suffix) {
  const people = Array.from({ length: 4 }, (_, i) => ({ id: `p:${i}`, name: `Personne ${i} ${suffix}` }));
  const groups = Array.from({ length: 4 }, (_, i) => ({ id: `g:${i}`, name: `Groupe ${i} ${suffix}` }));
  const resources = Array.from({ length: 3 }, (_, i) => ({ id: `r:${i}`, name: `Dossier ${i} ${suffix}` }));
  const memberships = [];
  for (const person of people) {
    for (const group of groups) if (next() < 0.45) memberships.push({ memberId: person.id, groupId: group.id });
  }
  // Ordered group edges generate DAGs; isolated groups and alternative routes
  // arise naturally without relying on the production cycle validator.
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (next() < 0.4) memberships.push({ memberId: groups[i].id, groupId: groups[j].id });
    }
  }
  const grants = [];
  for (const subject of [...people, ...groups]) {
    for (const resource of resources) {
      if (next() < 0.22) grants.push({ subjectId: subject.id, resourceId: resource.id, permission: 'read' });
    }
  }
  return { schemaVersion: 1, people, groups, resources, memberships, grants };
}

function relationKeys(snapshot) {
  return new Set([
    ...snapshot.memberships.map((edge) => JSON.stringify(['membership', edge.memberId, edge.groupId])),
    ...snapshot.grants.map((edge) => JSON.stringify(['grant', edge.subjectId, edge.resourceId])),
  ]);
}

function entityMap(snapshot) {
  return new Map([
    ...snapshot.people.map((entity) => [entity.id, { ...entity, kind: 'person' }]),
    ...snapshot.groups.map((entity) => [entity.id, { ...entity, kind: 'group' }]),
    ...snapshot.resources.map((entity) => [entity.id, { ...entity, kind: 'resource' }]),
  ]);
}

function verifyPath(finding, evidence, other, context) {
  assert.ok(finding.path, `${context}: accessible finding needs a path`);
  const { nodes, edges } = finding.path;
  assert.equal(nodes[0].id, finding.person.id, `${context}: path starts at the person`);
  assert.equal(nodes.at(-1).id, finding.resource.id, `${context}: path reaches the resource`);
  assert.equal(edges.length, nodes.length - 1, `${context}: contiguous path`);
  const labels = entityMap(evidence);
  const relations = relationKeys(evidence);
  const otherRelations = other ? relationKeys(other) : null;
  for (const node of nodes) {
    assert.equal(node.name, labels.get(node.id)?.name, `${context}: evidence snapshot label`);
    assert.equal(node.kind, labels.get(node.id)?.kind, `${context}: evidence node type`);
  }
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    assert.equal(edge.fromId, nodes[i].id, `${context}: edge origin`);
    assert.equal(edge.toId, nodes[i + 1].id, `${context}: edge destination`);
    const key = JSON.stringify([edge.kind, edge.fromId, edge.toId]);
    assert.ok(relations.has(key), `${context}: edge exists in evidence`);
    if (otherRelations) {
      const change = otherRelations.has(key) ? null : finding.kind === 'gained' ? 'added' : 'removed';
      assert.equal(edge.change ?? null, change, `${context}: every changed edge annotated`);
    }
  }
}

function findingKey(finding) {
  return JSON.stringify([finding.kind, finding.person.id, finding.resource.id]);
}

function expectedFindingKeys(left, right, kind) {
  return [...left].filter((pair) => !right.has(pair)).map((pair) => JSON.stringify([kind, ...JSON.parse(pair)]));
}

test('64 deterministic small graph pairs agree with an independent transitive-closure oracle', () => {
  for (let seed = 1; seed <= 64; seed++) {
    const next = random(seed);
    const before = validateSnapshot(sampleSnapshot(next, 'avant'));
    const after = validateSnapshot(sampleSnapshot(next, 'après'));
    const beforePairs = closureAccess(before);
    const afterPairs = closureAccess(after);
    const requiredRead = [];
    for (const person of after.people) {
      for (const resource of after.resources) {
        if (next() < 0.45) requiredRead.push({ personId: person.id, resourceId: resource.id });
      }
    }
    const reference = {
      schemaVersion: 1, coverage: 'all-after-pairs',
      peopleIds: after.people.map((person) => person.id),
      resourceIds: after.resources.map((resource) => resource.id), requiredRead,
    };
    const expectedChanges = [
      ...expectedFindingKeys(afterPairs, beforePairs, 'gained'),
      ...expectedFindingKeys(beforePairs, afterPairs, 'lost'),
    ].sort();
    const result = analyzeAccess(before, after, reference);
    assert.deepEqual(result.changes.map(findingKey).sort(), expectedChanges, `seed ${seed}: access differences`);
    assert.equal(result.counts.gained, expectedFindingKeys(afterPairs, beforePairs, 'gained').length);
    assert.equal(result.counts.lost, expectedFindingKeys(beforePairs, afterPairs, 'lost').length);
    for (const finding of result.changes) {
      const gained = finding.kind === 'gained';
      assert.equal(finding.snapshot, gained ? 'after' : 'before');
      verifyPath(finding, gained ? after : before, gained ? before : after, `seed ${seed}`);
    }

    const requiredPairs = new Set(requiredRead.map((entry) => JSON.stringify([entry.personId, entry.resourceId])));
    const expectedReference = [
      ...expectedFindingKeys(afterPairs, requiredPairs, 'unneeded'),
      ...expectedFindingKeys(requiredPairs, afterPairs, 'missing'),
    ].sort();
    assert.equal(result.reference.status, 'assessed');
    assert.deepEqual(result.reference.findings.map(findingKey).sort(), expectedReference, `seed ${seed}: exact reference deviations`);
    for (const finding of [...result.changes, ...result.reference.findings]) {
      const pair = JSON.stringify([finding.person.id, finding.resource.id]);
      assert.deepEqual(finding.context, {
        before: beforePairs.has(pair),
        after: afterPairs.has(pair),
        requirement: requiredPairs.has(pair) ? 'required' : 'not-required',
      }, `seed ${seed}: displayed context agrees with independent access evidence`);
    }
    for (const finding of result.reference.findings) {
      if (finding.kind === 'unneeded') verifyPath(finding, after, null, `seed ${seed}: unneeded`);
      else assert.equal(finding.path, null, `seed ${seed}: no invented missing-access path`);
    }

    const reverse = (snapshot) => Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Array.isArray(value) ? [...value].reverse() : value]));
    assert.deepEqual(
      compareSnapshots(before, after).changes,
      compareSnapshots(reverse(before), reverse(after)).changes,
      `seed ${seed}: representative evidence independent of input ordering`,
    );
  }
});
