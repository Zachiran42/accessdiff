import { parseStrictJson } from './json.js';

// The negative lookahead is an absolute end anchor (unlike $, which permits a final newline).
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}(?![\s\S])/;
const ROOT_FIELDS = ['schemaVersion', 'people', 'groups', 'resources', 'memberships', 'grants'];

function fail(path, message, code = 'INVALID_SNAPSHOT') {
  const error = new Error(`${path} : ${message}`);
  error.path = path;
  error.code = code;
  throw error;
}

function record(value, fields, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'un objet est attendu.');
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail(`${path}.${field}`, 'champ obligatoire absent.');
  }
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) fail(`${path}[${JSON.stringify(field)}]`, 'champ non pris en charge.');
  }
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, 'une liste est attendue.');
}

function identifier(value, path) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    fail(path, 'identifiant invalide : 1 à 64 caractères, lettres/chiffres puis lettres, chiffres, point, tiret, soulignement ou deux-points.');
  }
}

/** Validate the entire supported positive-read snapshot; never discard entries. */
export function validateSnapshot(value) {
  record(value, ROOT_FIELDS, '$');
  if (value.schemaVersion !== 1) fail('$.schemaVersion', 'seule la version 1 est prise en charge.');
  for (const field of ROOT_FIELDS.slice(1)) array(value[field], `$.${field}`);
  if (value.people.length + value.groups.length + value.resources.length > 100) {
    fail('$', 'la limite est de 100 personnes, groupes et ressources au total.', 'ENTITY_LIMIT');
  }
  if (value.memberships.length + value.grants.length > 500) {
    fail('$', 'la limite est de 500 adhésions et attributions au total.', 'RELATION_LIMIT');
  }

  const entities = new Map();
  for (const [field, kind] of [['people', 'person'], ['groups', 'group'], ['resources', 'resource']]) {
    value[field].forEach((entity, index) => {
      const path = `$.${field}[${index}]`;
      record(entity, ['id', 'name'], path);
      identifier(entity.id, `${path}.id`);
      if (entities.has(entity.id)) fail(`${path}.id`, `identifiant déjà utilisé : ${entity.id}.`);
      if (typeof entity.name !== 'string' || entity.name.trim().length === 0 || entity.name.length > 160) {
        fail(`${path}.name`, 'le nom doit être non vide et comporter au plus 160 unités UTF-16.');
      }
      entities.set(entity.id, { kind });
    });
  }

  function requireType(id, kinds, path) {
    identifier(id, path);
    const entity = entities.get(id);
    if (!entity) fail(path, `identifiant inconnu : ${id}.`);
    if (!kinds.includes(entity.kind)) fail(path, `type de référence invalide pour ${id}.`);
  }

  const memberships = new Set();
  const groupEdges = new Map(value.groups.map(({ id }) => [id, []]));
  value.memberships.forEach((membership, index) => {
    const path = `$.memberships[${index}]`;
    record(membership, ['memberId', 'groupId'], path);
    requireType(membership.memberId, ['person', 'group'], `${path}.memberId`);
    requireType(membership.groupId, ['group'], `${path}.groupId`);
    const key = JSON.stringify([membership.memberId, membership.groupId]);
    if (memberships.has(key)) fail(path, 'adhésion dupliquée.');
    memberships.add(key);
    if (membership.memberId === membership.groupId) fail(path, 'un groupe ne peut pas être membre de lui-même.', 'GROUP_CYCLE');
    if (entities.get(membership.memberId).kind === 'group') {
      groupEdges.get(membership.memberId).push({ to: membership.groupId, index });
    }
  });

  const grants = new Set();
  value.grants.forEach((grant, index) => {
    const path = `$.grants[${index}]`;
    record(grant, ['subjectId', 'resourceId', 'permission'], path);
    requireType(grant.subjectId, ['person', 'group'], `${path}.subjectId`);
    requireType(grant.resourceId, ['resource'], `${path}.resourceId`);
    if (grant.permission !== 'read') fail(`${path}.permission`, 'seule la permission « read » est prise en charge.');
    const key = JSON.stringify([grant.subjectId, grant.resourceId, grant.permission]);
    if (grants.has(key)) fail(path, 'attribution dupliquée.');
    grants.add(key);
  });

  // Traverse every group, including components no person currently reaches.
  const states = new Map();
  function visitGroup(id) {
    states.set(id, 1);
    for (const edge of groupEdges.get(id)) {
      if (states.get(edge.to) === 1) fail(`$.memberships[${edge.index}]`, 'cycle entre groupes détecté.', 'GROUP_CYCLE');
      if (!states.has(edge.to)) visitGroup(edge.to);
    }
    states.set(id, 2);
  }
  for (const id of groupEdges.keys()) if (!states.has(id)) visitGroup(id);
  return value;
}

export function parseSnapshot(text, options = {}) {
  try {
    return validateSnapshot(parseStrictJson(text));
  } catch (error) {
    if (options.label) error.message = `${options.label} — ${error.message}`;
    throw error;
  }
}
