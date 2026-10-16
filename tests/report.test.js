import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReport } from '../src/report.js';
import { analyzeAccess } from '../src/policy.js';
import { listRemovableRelations, simulateRemoval } from '../src/simulation.js';

const clara = { id: 'p:clara', name: 'Clara' };
const julien = { id: 'p:julien', name: 'Julien' };
const plan = { id: 'r:plan-it', name: 'Plan de renouvellement IT' };
const contracts = { id: 'r:contrats', name: 'Contrats fournisseurs' };

function finding(kind, person, resource, index = 0) {
  const snapshot = kind === 'lost' ? 'before' : 'after';
  return {
    id: `${kind}-${person.id}-${resource.id}`,
    kind, person: { ...person }, resource: { ...resource }, snapshot,
    context: {
      before: kind === 'lost' || kind === 'missing',
      after: kind === 'gained' || kind === 'unneeded',
      requirement: kind === 'missing' || (person.id === clara.id && resource.id === plan.id)
        || (person.id === julien.id && resource.id === contracts.id) ? 'required' : 'not-required',
    },
    path: kind === 'missing' ? null : {
      nodes: [{ ...person, kind: 'person' }, { id: 'g:support', name: 'Support', kind: 'group' }, { ...resource, kind: 'resource' }],
      edges: [
        { kind: 'membership', fromId: person.id, toId: 'g:support', change: kind === 'lost' ? 'removed' : kind === 'gained' ? 'added' : null },
        { kind: 'grant', fromId: 'g:support', toId: resource.id, permission: 'read', change: null },
      ],
    },
    ...(kind === 'missing' ? { referenceEntryIndex: index } : {}),
  };
}

function result() {
  return {
    changes: [finding('gained', clara, plan), finding('gained', clara, contracts), finding('lost', julien, plan), finding('lost', julien, contracts)],
    counts: { gained: 2, lost: 2 },
    reference: {
      status: 'assessed', counts: { unneeded: 1, missing: 1 },
      coverage: { people: 3, resources: 2, required: 3 },
      findings: [finding('unneeded', clara, contracts), finding('missing', julien, contracts, 2)],
    },
    inputs: { before: 'before.json', after: 'after.json', reference: 'required-read.json' },
    generatedAt: '2026-10-11T12:30:00.000Z', revision: 3,
  };
}

test('report includes all comparison and reference rows, evidence and coverage', () => {
  const data = result();
  const original = JSON.stringify(data);
  const html = createReport(data);
  assert.equal((html.match(/<article class="finding">/g) ?? []).length, 6);
  for (const label of ['Accès gagné', 'Accès perdu', 'Accès non requis selon la référence', 'Droit nécessaire manquant']) assert.ok(html.includes(label));
  for (const filename of Object.values(data.inputs)) assert.ok(html.includes(filename));
  assert.ok(html.includes('3 personnes, 2 ressources, 3 droits'));
  assert.ok(html.includes('requiredRead[2]'));
  assert.ok(html.includes('Appartenance. <strong>Ajoutée.'));
  assert.ok(html.includes('Appartenance. <strong>Retirée.'));
  assert.ok(html.includes('Aucun autre chemin'));
  assert.ok(html.includes('tous les chemins pris en charge contribuent'));
  assert.equal((html.match(/<dl class="access-summary">/g) ?? []).length, 6);
  assert.ok(html.includes('<dt>Avant</dt><dd>Absent</dd>'));
  assert.ok(html.includes('<dt>Après</dt><dd>Présent</dd>'));
  assert.ok(html.includes('<dt>Besoin déclaré</dt><dd>Oui</dd>'));
  assert.ok(html.includes('<dt>Besoin déclaré</dt><dd>Non</dd>'));
  assert.ok(html.includes('L’appartenance de Clara au groupe Support a été ajoutée.'));
  assert.ok(html.includes('L’appartenance de Julien au groupe Support a été retirée.'));
  assert.ok(html.includes('Tout accès absent de cette liste est considéré comme non requis'));
  assert.ok(html.includes('la validation du format et du périmètre ne vaut pas approbation métier'));
  assert.equal(JSON.stringify(data), original, 'export must not mutate the analysis');
});

test('all imported labels, identifiers, metadata and filenames remain escaped text', () => {
  const data = result();
  const attack = '<img src="https://malicious.invalid/x" onerror="alert(1)"><script>alert(2)</script> & \'quoted\'';
  data.inputs.before = attack;
  data.inputs.after = attack;
  data.inputs.reference = attack;
  data.generatedAt = attack;
  data.revision = attack;
  for (const item of [...data.changes, ...data.reference.findings]) {
    item.person.name = attack;
    item.person.id = attack;
    item.resource.name = attack;
    item.resource.id = attack;
    if (item.path) {
      const oldFirstId = item.path.nodes[0].id;
      item.path.nodes[0].id = attack;
      item.path.nodes[0].name = attack;
      item.path.nodes[1].name = attack;
      item.path.nodes[2].name = attack;
      item.path.edges.forEach(edge => { if (edge.fromId === oldFirstId) edge.fromId = attack; });
    }
    if (item.kind === 'missing') item.referenceEntryIndex = attack;
  }
  const html = createReport(data);
  assert.ok(html.includes('&lt;img src=&quot;https://malicious.invalid/x&quot;'));
  assert.ok(html.includes('&amp; &#39;quoted&#39;'));
  assert.doesNotMatch(html, /<script\b|<img\b|<iframe\b/i);
  for (const tag of html.match(/<[^>]*>/g) ?? []) assert.doesNotMatch(tag, /\sonerror\s*=/i);
  assert.doesNotMatch(html, /<(?:link|script|img|iframe|a)\b/i);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["']/i);
});

test('report is a standalone UTF-8 document with no executable or remote assets', () => {
  const html = createReport(result());
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /<script\b|@import|url\s*\(|<(?:img|link|iframe|a)\b/i);
});

test('missing rights cite a declared requirement and do not fabricate an access path', () => {
  const data = result();
  data.changes = [];
  data.counts = { gained: 0, lost: 0 };
  data.reference.findings = [finding('missing', julien, contracts, 2)];
  data.reference.counts = { unneeded: 0, missing: 1 };
  const html = createReport(data);
  assert.ok(html.includes('requiredRead[2]'));
  assert.ok(html.includes('Aucun chemin d’accès en lecture n’existe'));
  assert.doesNotMatch(html, /<ol class="path">/);
});

test('absent reference and no effective changes stay explicit', () => {
  const data = result();
  data.changes = [];
  data.counts = { gained: 0, lost: 0 };
  data.reference = { status: 'not-assessed', findings: [], counts: { unneeded: 0, missing: 0 }, coverage: null };
  data.inputs.reference = null;
  const html = createReport(data);
  assert.ok(html.includes('Aucune différence d’accès effectif'));
  assert.ok(html.includes('Évaluation du moindre privilège non réalisée'));
  assert.ok(html.includes('<dd>Non fournie</dd>'));
  assert.ok(html.includes('Les différences observées ne permettent pas de décider'));
});

test('zero reference deviations do not imply general security or compliance', () => {
  const data = result();
  data.reference.findings = [];
  data.reference.counts = { unneeded: 0, missing: 0 };
  const html = createReport(data);
  assert.ok(html.includes('Aucun écart avec la référence fournie'));
  assert.ok(html.includes('ne certifie ni la sécurité ni la conformité'));
});

test('unneeded-path edges do not claim comparative evidence that was not calculated', () => {
  const data = result();
  data.changes = [];
  data.counts = { gained: 0, lost: 0 };
  data.reference.findings = [finding('unneeded', clara, contracts)];
  data.reference.counts = { unneeded: 1, missing: 0 };
  const html = createReport(data);
  assert.ok(html.includes('Présente dans Après'));
  assert.ok(!html.includes('Présente dans les deux instantanés'));
  assert.ok(!html.includes('Ce qui a changé dans le chemin présenté'));
});

test('context states use the supplied evidence independently of finding kind', () => {
  const data = result();
  data.changes = [];
  data.counts = { gained: 0, lost: 0 };
  data.reference.findings = [finding('unneeded', clara, contracts)];
  data.reference.counts = { unneeded: 1, missing: 0 };
  data.reference.findings[0].context.before = true;
  let html = createReport(data);
  assert.ok(html.includes('<dt>Avant</dt><dd>Présent</dd>'));
  assert.ok(!html.includes('<dt>Avant</dt><dd>Absent</dd>'));
  data.reference.findings[0].context.before = false;
  html = createReport(data);
  assert.ok(html.includes('<dt>Avant</dt><dd>Absent</dd>'));
});

test('unassessed needs and entities outside After remain distinct in exported context', () => {
  const data = result();
  data.reference = { status: 'not-assessed', findings: [], counts: { unneeded: 0, missing: 0 }, coverage: null };
  data.inputs.reference = null;
  for (const item of data.changes) item.context.requirement = 'not-assessed';
  let html = createReport(data);
  assert.ok(html.includes('<dt>Besoin déclaré</dt><dd>Non évalué</dd>'));
  assert.ok(!html.includes('<dt>Besoin déclaré</dt><dd>Non</dd>'));
  data.changes[2].context.requirement = 'out-of-scope';
  html = createReport(data);
  assert.ok(html.includes('<dt>Besoin déclaré</dt><dd>Hors périmètre Après</dd>'));
});

test('cause cites every changed relationship without recommending a removal', () => {
  const data = result();
  data.changes[0].path.edges[1].change = 'added';
  const html = createReport(data);
  assert.ok(html.includes('L’appartenance de Clara au groupe Support a été ajoutée. L’autorisation de lecture de Support vers Plan de renouvellement IT a été ajoutée.'));
  assert.ok(!html.includes('Il faut retirer'));
});

test('path annotations distinguish changed entities from changed relationships', () => {
  const data = result();
  data.changes[0].path.nodes[1].change = 'added';
  data.changes[2].path.nodes[0].change = 'removed';
  const html = createReport(data);
  assert.ok(html.includes('Entité ajoutée'));
  assert.ok(html.includes('Entité supprimée'));
  assert.ok(html.includes('Appartenance. <strong>Ajoutée.'));
});

test('report rejects incomplete analysis or explanation instead of emitting partial evidence', () => {
  assert.throws(() => createReport(null), /analyse complète/);
  const data = result();
  data.changes[0].path = null;
  assert.throws(() => createReport(data), /chemin valide/);
  const incomplete = result();
  incomplete.changes[0].path.edges[0].toId = 'g:not-in-path';
  assert.throws(() => createReport(incomplete), /chemin incomplet/);
  for (const context of [undefined, {}, { before: 'false', after: true, requirement: 'required' }, { before: false, after: true, requirement: 'approved' }]) {
    const invalid = result();
    invalid.changes[0].context = context;
    assert.throws(() => createReport(invalid), /contexte Avant \/ Après/);
  }
});

function simulatedResult({ withReference = true, alternatePath = false, removeGrant = false } = {}) {
  const readExample = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
  const before = readExample('before');
  const after = readExample('after');
  const reference = withReference ? readExample('required-read') : null;
  if (alternatePath) after.grants.push({ subjectId: clara.id, resourceId: contracts.id, permission: 'read' });
  const relation = listRemovableRelations(after).find(item => removeGrant
    ? item.kind === 'grant' && item.from.id === 'g:support-n2' && item.to.id === contracts.id
    : item.kind === 'membership' && item.from.id === 'g:support-n1' && item.to.id === 'g:support-n2');
  assert.ok(relation, 'test relation must be available');
  return {
    ...analyzeAccess(before, after, reference),
    inputs: { before: 'before.json', after: 'after.json', reference: withReference ? 'required-read.json' : null },
    generatedAt: '2026-10-11T12:30:00.000Z', revision: 3,
    simulation: {
      ...simulateRemoval(after, reference, relation.id),
      generatedAt: '2026-10-11T12:31:00.000Z', revision: 4,
    },
  };
}

const simulationHtml = html => html.slice(html.indexOf('<section class="simulation">'), html.indexOf('<section><h2>Modèle et limites'));

test('optional simulation never changes the original comparison or reference sections', () => {
  const data = simulatedResult();
  const original = JSON.stringify(data);
  const withoutSimulation = { ...data, simulation: null };
  const baseline = createReport(withoutSimulation);
  const full = createReport(data);
  const extractInitial = html => html.slice(html.indexOf('<section><h2>Différences Avant / Après'),
    html.includes('<section class="simulation">') ? html.indexOf('<section class="simulation">') : html.indexOf('<section><h2>Modèle et limites')).trim();
  assert.equal(extractInitial(full), extractInitial(baseline));
  assert.equal(createReport({ ...withoutSimulation, simulation: undefined }), baseline);
  assert.equal(JSON.stringify(data), original, 'export must not mutate the baseline or simulation');
});

test('simulation exports actual consequences with explicit time labels and existing missing rights separated', () => {
  const data = simulatedResult();
  assert.deepEqual(data.simulation.impact, { status: 'assessed', removedUnneeded: 1, newlyMissing: 1, alreadyMissing: 1, remainingUnneeded: 0 });
  const section = simulationHtml(createReport(data));
  assert.ok(section.includes('Simulation — retrait d’une relation'));
  assert.ok(section.includes('Retrait fictif unique'));
  assert.ok(section.includes('Support N1'));
  assert.ok(section.includes('Support N2'));
  assert.ok(section.includes('<dt>Après courant</dt><dd>Présent</dd>'));
  assert.ok(section.includes('<dt>Scénario</dt><dd>Absent</dd>'));
  assert.ok(section.includes('<dt>Besoin déclaré</dt><dd>Oui</dd>'));
  assert.ok(section.includes('<dt>Besoin déclaré</dt><dd>Non</dd>'));
  for (const [label, count] of [
    ['Accès non requis retirés', 1], ['Droits nécessaires nouvellement manquants', 1],
    ['Droits nécessaires déjà manquants', 1], ['Accès non requis restants', 0],
  ]) assert.ok(section.includes(`<dt>${label}</dt><dd>${count}</dd>`));
  assert.equal((section.match(/<article class="finding">/g) ?? []).length, 3, 'two simulated losses plus one previously missing right');
  assert.equal((section.match(/<ol class="path">/g) ?? []).length, 2, 'existing missing access must not have an invented path');
  assert.ok(section.includes('Ce chemin existe dans Après courant. Aucun autre chemin d’accès en lecture ne subsiste dans le scénario'));
  assert.ok(section.includes('Aucun chemin d’accès en lecture n’existe dans le scénario'));
  assert.ok(section.includes('requiredRead[2]'));
  assert.ok(section.includes('2026-10-11T12:31:00.000Z'));
  assert.ok(section.includes('<dt>Révision de la simulation</dt><dd>4</dd>'));
  assert.doesNotMatch(section, /<dt>Avant<\/dt>|<dt>Après<\/dt>|Ce chemin appartenait à Avant|Présente dans les deux instantanés/);
});

test('simulation without a business reference reports losses but never classifies them as business impact', () => {
  const data = simulatedResult({ withReference: false });
  const section = simulationHtml(createReport(data));
  assert.equal((section.match(/<article class="finding">/g) ?? []).length, 2);
  assert.ok(section.includes('Impact métier non évalué'));
  assert.ok(section.includes('<dt>Besoin déclaré</dt><dd>Non évalué</dd>'));
  assert.doesNotMatch(section, /<dt>Accès non requis retirés<\/dt>|<dt>Droits nécessaires nouvellement manquants<\/dt>|Droits nécessaires déjà manquants avant la simulation/);
});

test('simulation with unchanged effective access exports retained evidence in the scenario', () => {
  const data = simulatedResult({ alternatePath: true, removeGrant: true });
  assert.deepEqual(data.simulation.counts, { gained: 0, lost: 0 });
  assert.equal(data.simulation.retained.length, 1);
  const section = simulationHtml(createReport(data));
  assert.ok(section.includes('Autorisation de lecture retirée'));
  assert.ok(section.includes('Aucun accès effectif ne change après ce retrait fictif'));
  assert.ok(section.includes('Accès conservé par un autre chemin — Clara → Contrats fournisseurs'));
  assert.ok(section.includes('<dt>Après courant</dt><dd>Présent</dd>'));
  assert.ok(section.includes('<dt>Scénario</dt><dd>Présent</dd>'));
  assert.ok(section.includes('Chemin représentatif dans <strong>le scénario</strong>'));
  assert.ok(section.includes('Présente dans le scénario'));
  assert.ok(section.includes('sans utiliser la relation retirée'));
  const retainedCard = section.match(/<article class="finding">[\s\S]*?<\/article>/)?.[0];
  assert.ok(retainedCard);
  assert.ok(!retainedCard.includes('Support N2'), 'retained path uses the direct grant and excludes the removed relation');
  assert.doesNotMatch(section, /Présente dans les deux instantanés|<dt>Avant<\/dt>|<dt>Après<\/dt>/);
});

test('simulation relation names, IDs and metadata are escaped and add no executable content', () => {
  const data = simulatedResult();
  const attack = '<script>alert(1)</script><img src="https://malicious.invalid/x" onerror="alert(2)"> & \'quoted\'';
  data.simulation.relation.id = attack;
  for (const entity of [data.simulation.relation.from, data.simulation.relation.to]) {
    entity.id = attack;
    entity.name = attack;
  }
  data.simulation.generatedAt = attack;
  data.simulation.revision = attack;
  const html = createReport(data);
  const section = simulationHtml(html);
  assert.ok(section.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(section.includes('&amp; &#39;quoted&#39;'));
  assert.doesNotMatch(html, /<script\b|@import|url\s*\(|<(?:img|link|iframe|a)\b/i);
  for (const tag of html.match(/<[^>]*>/g) ?? []) assert.doesNotMatch(tag, /\sonerror\s*=/i);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["']/i);
});

test('incomplete simulation is rejected rather than exporting a partial scenario', () => {
  for (const broken of [
    {},
    { relation: {} },
    { ...simulatedResult().simulation, retained: null },
    { ...simulatedResult().simulation, impact: { status: 'assessed' } },
    { ...simulatedResult().simulation, impact: { status: 'not-assessed' } },
  ]) assert.throws(() => createReport({ ...result(), simulation: broken }), /simulation|effets métier/);
});
