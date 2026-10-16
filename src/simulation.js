import { validateSnapshot } from './snapshot.js';
import { computeAccess } from './access.js';
import { analyzeAccess, evaluateReference } from './policy.js';

const compareIds = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const pairKey = (personId, resourceId) => JSON.stringify([personId, resourceId]);
const relationKey = (kind, fromId, toId, permission = null) => JSON.stringify([kind, fromId, toId, permission]);

function fail(message, code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

/** The identifier names an exact relation, independently of input array order. */
export function listRemovableRelations(after) {
  validateSnapshot(after);
  const entities = new Map();
  for (const [field, kind] of [['people', 'person'], ['groups', 'group'], ['resources', 'resource']]) {
    for (const entity of after[field]) entities.set(entity.id, { ...entity, kind });
  }
  const relations = after.memberships.map(({ memberId, groupId }) => ({
    id: relationKey('membership', memberId, groupId), kind: 'membership',
    from: { ...entities.get(memberId) }, to: { ...entities.get(groupId) },
  }));
  for (const { subjectId, resourceId, permission } of after.grants) {
    relations.push({
      id: relationKey('grant', subjectId, resourceId, permission), kind: 'grant',
      from: { ...entities.get(subjectId) }, to: { ...entities.get(resourceId) }, permission,
    });
  }
  return relations.sort((left, right) => compareIds(left.kind, right.kind)
    || compareIds(left.from.id, right.from.id) || compareIds(left.to.id, right.to.id));
}

function copyWithoutRelation(after, relation) {
  return {
    schemaVersion: after.schemaVersion,
    people: after.people.map(entity => ({ ...entity })),
    groups: after.groups.map(entity => ({ ...entity })),
    resources: after.resources.map(entity => ({ ...entity })),
    memberships: after.memberships
      .filter(({ memberId, groupId }) => relation.id !== relationKey('membership', memberId, groupId))
      .map(edge => ({ ...edge })),
    grants: after.grants
      .filter(({ subjectId, resourceId, permission }) => relation.id !== relationKey('grant', subjectId, resourceId, permission))
      .map(edge => ({ ...edge })),
  };
}

function outgoingRelations(after) {
  const outgoing = new Map([...after.people, ...after.groups, ...after.resources].map(({ id }) => [id, []]));
  for (const { memberId, groupId } of after.memberships) outgoing.get(memberId).push(groupId);
  for (const { subjectId, resourceId } of after.grants) outgoing.get(subjectId).push(resourceId);
  return outgoing;
}

function reachableFrom(startId, outgoing) {
  const reached = new Set([startId]);
  const queue = [startId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of outgoing.get(queue[cursor])) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

/** One temporary removal from the supplied After; never edit or accumulate changes. */
export function simulateRemoval(after, reference = null, relationId) {
  const relation = listRemovableRelations(after).find(entry => entry.id === relationId);
  if (typeof relationId !== 'string' || !relation) {
    fail('Sélectionnez une relation existante dans Après.', 'INVALID_RELATION');
  }
  const scenario = copyWithoutRelation(after, relation);
  const analysis = analyzeAccess(after, scenario, reference);
  const originalAccess = computeAccess(after);
  const scenarioAccess = computeAccess(scenario);
  const outgoing = outgoingRelations(after);
  const downstream = reachableFrom(relation.to.id, outgoing);
  const required = new Set(reference?.requiredRead.map(({ personId, resourceId }) => pairKey(personId, resourceId)));
  const retained = [];

  // In this validated acyclic model, reaching the relation's source and then
  // a resource from its target proves an original route using that exact edge.
  // The scenario path proves a different route survives the removed edge.
  for (const person of [...after.people].sort((left, right) => compareIds(left.id, right.id))) {
    if (!reachableFrom(person.id, outgoing).has(relation.from.id)) continue;
    for (const resource of [...after.resources].sort((left, right) => compareIds(left.id, right.id))) {
      const path = scenarioAccess.get(person.id)?.get(resource.id);
      if (!downstream.has(resource.id) || !path) continue;
      retained.push({
        id: JSON.stringify(['retained', person.id, resource.id]), kind: 'retained',
        person: { ...person }, resource: { ...resource }, snapshot: 'after', path,
        context: {
          before: true, after: true,
          requirement: reference === null ? 'not-assessed'
            : required.has(pairKey(person.id, resource.id)) ? 'required' : 'not-required',
        },
      });
    }
  }
  if (analysis.changes.length + analysis.reference.findings.length + retained.length > 1000) {
    fail('La simulation dépasse la limite de 1 000 lignes (différences, écarts métier et accès conservés réunis). Aucun résultat partiel n’est produit.', 'RESULT_LIMIT');
  }

  let impact = {
    status: 'not-assessed', removedUnneeded: null, newlyMissing: null,
    alreadyMissing: null, remainingUnneeded: null,
  };
  if (reference !== null) {
    const baseline = evaluateReference(reference, after, originalAccess);
    const missingBefore = new Set(baseline.findings.filter(finding => finding.kind === 'missing')
      .map(finding => pairKey(finding.person.id, finding.resource.id)));
    const missingAfter = analysis.reference.findings.filter(finding => finding.kind === 'missing');
    impact = {
      status: 'assessed',
      removedUnneeded: baseline.counts.unneeded - analysis.reference.counts.unneeded,
      newlyMissing: missingAfter.filter(finding => !missingBefore.has(pairKey(finding.person.id, finding.resource.id))).length,
      alreadyMissing: missingAfter.filter(finding => missingBefore.has(pairKey(finding.person.id, finding.resource.id))).length,
      remainingUnneeded: analysis.reference.counts.unneeded,
    };
  }
  return { relation, ...analysis, impact, retained };
}
