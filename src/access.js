import { validateSnapshot } from './snapshot.js';

const compareIds = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const edgeKey = (edge) => JSON.stringify([edge.kind, edge.fromId, edge.toId, edge.permission ?? null]);

function indexSnapshot(snapshot) {
  const entities = new Map();
  for (const [field, kind] of [['people', 'person'], ['groups', 'group'], ['resources', 'resource']]) {
    for (const entity of snapshot[field]) entities.set(entity.id, { ...entity, kind });
  }
  const outgoing = new Map([...entities.keys()].map((id) => [id, []]));
  const edges = [];
  for (const { memberId, groupId } of snapshot.memberships) {
    edges.push({ kind: 'membership', fromId: memberId, toId: groupId, change: null });
  }
  for (const { subjectId, resourceId, permission } of snapshot.grants) {
    edges.push({ kind: 'grant', fromId: subjectId, toId: resourceId, permission, change: null });
  }
  for (const edge of edges) outgoing.get(edge.fromId).push(edge);
  for (const list of outgoing.values()) list.sort((left, right) => compareIds(left.toId, right.toId));
  return { entities, outgoing, edgeKeys: new Set(edges.map(edgeKey)) };
}

function reconstruct(resourceId, personId, predecessors, entities) {
  const edges = [];
  let id = resourceId;
  while (id !== personId) {
    const edge = predecessors.get(id);
    if (!edge) throw new Error('Impossible de reconstruire le chemin d’accès calculé.');
    edges.push({ ...edge });
    id = edge.fromId;
  }
  edges.reverse();
  const nodes = [personId, ...edges.map((edge) => edge.toId)].map((nodeId) => ({ ...entities.get(nodeId) }));
  return { nodes, edges };
}

function computeValidated(snapshot, index) {
  const access = new Map();
  const people = [...snapshot.people].sort((left, right) => compareIds(left.id, right.id));
  for (const person of people) {
    const queue = [person.id];
    const visited = new Set(queue);
    const predecessors = new Map();
    const reachedResources = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const edge of index.outgoing.get(queue[cursor])) {
        if (visited.has(edge.toId)) continue;
        visited.add(edge.toId);
        predecessors.set(edge.toId, edge);
        queue.push(edge.toId);
        if (index.entities.get(edge.toId).kind === 'resource') reachedResources.push(edge.toId);
      }
    }
    reachedResources.sort(compareIds);
    access.set(person.id, new Map(reachedResources.map((resourceId) => [resourceId,
      reconstruct(resourceId, person.id, predecessors, index.entities)])));
  }
  return access;
}

/** Traverse all supported routes, retaining one deterministic shortest explanation. */
export function computeAccess(snapshot) {
  validateSnapshot(snapshot);
  return computeValidated(snapshot, indexSnapshot(snapshot));
}

function changedPath(path, otherIndex, change) {
  const annotated = {
    nodes: path.nodes.map((node) => ({ ...node, change: otherIndex.entities.has(node.id) ? null : change })),
    edges: path.edges.map((edge) => ({ ...edge, change: otherIndex.edgeKeys.has(edgeKey(edge)) ? null : change })),
  };
  if (!annotated.edges.some((edge) => edge.change === change)) {
    const error = new Error('Erreur interne : aucun changement de relation ne justifie cette différence d’accès.');
    error.code = 'UNEXPLAINED_ACCESS_CHANGE';
    throw error;
  }
  return annotated;
}

export function compareSnapshots(before, after) {
  validateSnapshot(before);
  validateSnapshot(after);
  const beforeIndex = indexSnapshot(before);
  const afterIndex = indexSnapshot(after);
  for (const [id, entity] of beforeIndex.entities) {
    if (afterIndex.entities.has(id) && afterIndex.entities.get(id).kind !== entity.kind) {
      const error = new Error(`L’identifiant ${id} change de type entre Avant et Après ; un identifiant stable doit conserver son type.`);
      error.path = '$';
      error.code = 'ENTITY_TYPE_CHANGED';
      throw error;
    }
  }
  const beforeAccess = computeValidated(before, beforeIndex);
  const afterAccess = computeValidated(after, afterIndex);
  const changes = [];
  const counts = { gained: 0, lost: 0 };
  const personIds = [...new Set([...beforeAccess.keys(), ...afterAccess.keys()])].sort(compareIds);
  for (const personId of personIds) {
    const oldRights = beforeAccess.get(personId) ?? new Map();
    const newRights = afterAccess.get(personId) ?? new Map();
    const resourceIds = [...new Set([...oldRights.keys(), ...newRights.keys()])].sort(compareIds);
    for (const resourceId of resourceIds) {
      if (oldRights.has(resourceId) === newRights.has(resourceId)) continue;
      const kind = newRights.has(resourceId) ? 'gained' : 'lost';
      const snapshot = kind === 'gained' ? 'after' : 'before';
      const index = kind === 'gained' ? afterIndex : beforeIndex;
      const otherIndex = kind === 'gained' ? beforeIndex : afterIndex;
      const rights = kind === 'gained' ? newRights : oldRights;
      const person = index.entities.get(personId);
      const resource = index.entities.get(resourceId);
      changes.push({
        id: JSON.stringify([kind, personId, resourceId]), kind,
        person: { id: person.id, name: person.name },
        resource: { id: resource.id, name: resource.name }, snapshot,
        path: changedPath(rights.get(resourceId), otherIndex, kind === 'gained' ? 'added' : 'removed'),
      });
      counts[kind] += 1;
    }
  }
  return { changes, counts, beforeAccess, afterAccess };
}
