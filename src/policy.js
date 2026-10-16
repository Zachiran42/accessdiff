import { parseStrictJson } from './json.js';
import { validateSnapshot } from './snapshot.js';
import { compareSnapshots, computeAccess } from './access.js';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}(?![\s\S])/;
const compareIds = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const pairKey = (personId, resourceId) => JSON.stringify([personId, resourceId]);

function fail(path, message, code = 'INVALID_REFERENCE') {
  const error = new Error(`${path} : ${message}`);
  error.path = path;
  error.code = code;
  throw error;
}

function record(value, fields, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'un objet est attendu.');
  for (const field of fields) if (!Object.hasOwn(value, field)) fail(`${path}.${field}`, 'champ obligatoire absent.');
  for (const field of Object.keys(value)) if (!fields.includes(field)) fail(`${path}[${JSON.stringify(field)}]`, 'champ non pris en charge.');
}

function identifier(value, path) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail(path, 'identifiant invalide (1 à 64 caractères autorisés).');
}

function validateStructure(reference) {
  record(reference, ['schemaVersion', 'coverage', 'peopleIds', 'resourceIds', 'requiredRead'], '$');
  if (reference.schemaVersion !== 1) fail('$.schemaVersion', 'seule la version 1 est prise en charge.');
  if (reference.coverage !== 'all-after-pairs') fail('$.coverage', 'la couverture doit être « all-after-pairs ».');
  const idSets = {};
  for (const field of ['peopleIds', 'resourceIds']) {
    if (!Array.isArray(reference[field])) fail(`$.${field}`, 'une liste est attendue.');
    idSets[field] = new Set();
    reference[field].forEach((id, index) => {
      identifier(id, `$.${field}[${index}]`);
      if (idSets[field].has(id)) fail(`$.${field}[${index}]`, `identifiant dupliqué : ${id}.`);
      idSets[field].add(id);
    });
  }
  if (!Array.isArray(reference.requiredRead)) fail('$.requiredRead', 'une liste est attendue.');
  if (reference.requiredRead.length > 2500) fail('$.requiredRead', 'la limite est de 2 500 droits nécessaires.', 'REQUIREMENT_LIMIT');
  const requirements = new Set();
  reference.requiredRead.forEach((entry, index) => {
    const path = `$.requiredRead[${index}]`;
    record(entry, ['personId', 'resourceId'], path);
    identifier(entry.personId, `${path}.personId`);
    identifier(entry.resourceId, `${path}.resourceId`);
    if (!idSets.peopleIds.has(entry.personId)) fail(`${path}.personId`, 'personne absente de la couverture déclarée.');
    if (!idSets.resourceIds.has(entry.resourceId)) fail(`${path}.resourceId`, 'ressource absente de la couverture déclarée.');
    const key = pairKey(entry.personId, entry.resourceId);
    if (requirements.has(key)) fail(path, 'droit nécessaire dupliqué.');
    requirements.add(key);
  });
  return reference;
}

export function parseReference(text, options = {}) {
  try {
    return validateStructure(parseStrictJson(text));
  } catch (error) {
    if (options.label) error.message = `${options.label} — ${error.message}`;
    throw error;
  }
}

/** Complete coverage is mandatory: an omitted pair explicitly means not needed. */
export function validateReference(reference, after) {
  validateStructure(reference);
  validateSnapshot(after);
  for (const [field, entities] of [['peopleIds', after.people], ['resourceIds', after.resources]]) {
    const expected = new Set(entities.map(({ id }) => id));
    const declared = new Set(reference[field]);
    for (const id of declared) if (!expected.has(id)) fail(`$.${field}`, `identifiant absent d’Après : ${id}.`, 'REFERENCE_COVERAGE');
    for (const id of expected) if (!declared.has(id)) fail(`$.${field}`, `la couverture d’Après est incomplète : ${id} manque.`, 'REFERENCE_COVERAGE');
  }
  return reference;
}

export function evaluateReference(reference, after, afterAccess = computeAccess(after)) {
  validateReference(reference, after);
  const people = new Map(after.people.map((person) => [person.id, person]));
  const resources = new Map(after.resources.map((resource) => [resource.id, resource]));
  const required = new Set(reference.requiredRead.map(({ personId, resourceId }) => pairKey(personId, resourceId)));
  const findings = [];
  const counts = { unneeded: 0, missing: 0 };
  for (const [personId, rights] of afterAccess) {
    for (const [resourceId, path] of rights) {
      if (required.has(pairKey(personId, resourceId))) continue;
      findings.push({
        id: JSON.stringify(['unneeded', personId, resourceId]), kind: 'unneeded',
        person: { ...people.get(personId) }, resource: { ...resources.get(resourceId) }, snapshot: 'after', path,
      });
      counts.unneeded += 1;
    }
  }
  reference.requiredRead.forEach(({ personId, resourceId }, referenceEntryIndex) => {
    if (afterAccess.get(personId)?.has(resourceId)) return;
    findings.push({
      id: JSON.stringify(['missing', personId, resourceId]), kind: 'missing',
      person: { ...people.get(personId) }, resource: { ...resources.get(resourceId) }, snapshot: 'after',
      path: null, referenceEntryIndex,
    });
    counts.missing += 1;
  });
  findings.sort((left, right) => compareIds(left.person.id, right.person.id) || compareIds(left.resource.id, right.resource.id));
  return {
    status: 'assessed', findings, counts,
    coverage: { people: reference.peopleIds.length, resources: reference.resourceIds.length, required: reference.requiredRead.length },
  };
}

/** Combined result is atomic: overflow or invalid evidence yields no partial report. */
export function analyzeAccess(before, after, reference = null) {
  const comparison = compareSnapshots(before, after);
  const assessment = reference === null
    ? { status: 'not-assessed', findings: [], counts: { unneeded: 0, missing: 0 }, coverage: null }
    : evaluateReference(reference, after, comparison.afterAccess);
  if (comparison.changes.length + assessment.findings.length > 1000) {
    fail('$', 'l’analyse dépasse la limite de 1 000 lignes (différences et écarts métier réunis). Aucun résultat partiel n’est produit.', 'RESULT_LIMIT');
  }
  const peopleAfter = new Set(after.people.map(({ id }) => id));
  const resourcesAfter = new Set(after.resources.map(({ id }) => id));
  const required = new Set(reference?.requiredRead.map(({ personId, resourceId }) => pairKey(personId, resourceId)));
  const withContext = (finding) => {
    const personId = finding.person.id;
    const resourceId = finding.resource.id;
    const requirement = reference === null
      ? 'not-assessed'
      : !peopleAfter.has(personId) || !resourcesAfter.has(resourceId)
        ? 'out-of-scope'
        : required.has(pairKey(personId, resourceId)) ? 'required' : 'not-required';
    return {
      ...finding,
      context: {
        before: comparison.beforeAccess.get(personId)?.has(resourceId) ?? false,
        after: comparison.afterAccess.get(personId)?.has(resourceId) ?? false,
        requirement,
      },
    };
  };
  return {
    changes: comparison.changes.map(withContext),
    counts: comparison.counts,
    reference: { ...assessment, findings: assessment.findings.map(withContext) },
  };
}
