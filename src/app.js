import { createSession } from './session.js';
import { createReport } from './report.js';

const session = createSession();
const $ = id => document.getElementById(id);
let relationResult = null;
let displayedSimulation = null;
let selectedSimulationId = null;
const LABELS = {
  gained: { label: 'Accès gagné', symbol: '+', description: 'Cet accès est présent Après et ne l’était pas Avant.' },
  lost: { label: 'Accès perdu', symbol: '−', description: 'Cet accès existait Avant. Aucun chemin ne le conserve Après.' },
  unneeded: { label: 'Non requis', symbol: '!', description: 'Cet accès existe Après, mais il n’est pas requis selon la référence métier fournie.' },
  missing: { label: 'Requis manquant', symbol: '!', description: 'La référence métier demande cet accès. Aucun chemin valide ne l’accorde Après.' },
};
const INPUT_STATUS = { empty: 'À charger', loading: 'Lecture…', valid: '✓ Valide', invalid: 'À corriger', waiting: 'En attente d’Après' };
const NODE_KINDS = { person: 'PERSONNE', group: 'GROUPE', resource: 'RESSOURCE' };
const REQUIREMENT_LABELS = {
  required: 'Oui',
  'not-required': 'Non',
  'not-assessed': 'Non évalué',
  'out-of-scope': 'Hors périmètre Après',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function badge(kind) {
  const meta = LABELS[kind];
  return element('span', `finding-badge ${kind}`, `${meta.symbol} ${meta.label}`);
}
function setText(id, text) { if ($(id).textContent !== text) $(id).textContent = text; }

for (const role of ['before', 'after', 'reference']) {
  $(`${role}-file`).addEventListener('change', event => {
    const file = event.currentTarget.files[0];
    if (file) session.loadFile(role, file);
    // The same file may be deliberately chosen again after it was edited.
    event.currentTarget.value = '';
  });
}
$('remove-reference').addEventListener('click', () => session.removeReference());
$('analyze-button').addEventListener('click', () => session.analyze());
$('changes-view').addEventListener('click', () => session.setView('changes'));
$('reference-view').addEventListener('click', () => session.setView('reference'));
$('open-simulation').addEventListener('click', () => $('simulation-relation').focus());
$('simulation-relation').addEventListener('change', () => {
  // A new selection must not leave the old scenario available for export.
  session.resetSimulation();
});
$('simulate-button').addEventListener('click', () => {
  if (session.simulateRemoval($('simulation-relation').value)) {
    $('simulation-output').scrollIntoView({ block: 'start' });
    $('simulation-relation-title').focus({ preventScroll: true });
  }
});
$('reset-simulation').addEventListener('click', () => {
  $('simulation-relation').value = '';
  session.resetSimulation();
  $('simulation-relation').focus();
});
$('example-button').addEventListener('click', () => {
  session.loadExample(async () => {
    const definitions = [['before', 'before.json'], ['after', 'after.json'], ['reference', 'required-read.json']];
    const entries = await Promise.all(definitions.map(async ([role, name]) => {
      const response = await fetch(new URL(`../examples/${name}`, import.meta.url));
      if (!response.ok) throw new Error(`Impossible de charger ${name} (${response.status}).`);
      return [role, { name, text: await response.text() }];
    }));
    return Object.fromEntries(entries);
  });
});
$('export-button').addEventListener('click', () => {
  const current = session.getExportResult();
  if (!current) return;
  let url;
  try {
    const report = createReport(current);
    // Recheck freshness before the download starts.
    if (session.getExportResult() !== current) return;
    url = URL.createObjectURL(new Blob([report], { type: 'text/html;charset=utf-8' }));
    const link = element('a');
    link.href = url;
    link.download = 'accessdiff-rapport.html';
    document.body.append(link);
    link.click();
    link.remove();
    setText('status-message', 'Rapport généré localement. Retrouvez-le dans les téléchargements de votre navigateur.');
  } catch (caught) {
    setText('status-message', `Export impossible : ${caught instanceof Error ? caught.message : 'erreur inattendue.'}`);
    $('status-message').classList.add('error');
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

function renderInputs(state) {
  for (const role of ['before', 'after', 'reference']) {
    const input = state.inputs[role];
    setText(`${role}-name`, input.name ?? (role === 'reference' ? 'Aucune référence fournie' : 'Aucun fichier sélectionné'));
    $(`${role}-name`).classList.toggle('loaded', input.name !== null);
    setText(`${role}-action`, input.name ? 'Remplacer' : 'Choisir un fichier');
    const status = role === 'reference'
      ? input.status === 'empty' ? 'Non évalué' : input.status === 'valid' ? '✓ Format et périmètre valides' : INPUT_STATUS[input.status]
      : INPUT_STATUS[input.status];
    setText(`${role}-status`, status);
    $(`${role}-status`).className = `input-status ${input.status}`;
    const errorNode = $(`${role}-error`);
    errorNode.textContent = input.error ?? '';
    errorNode.hidden = !input.error;
    const picker = $(`${role}-file`);
    picker.setAttribute('aria-invalid', String(input.status === 'invalid'));
    const descriptions = [role === 'reference' ? 'reference-guidance' : null, input.error ? `${role}-error` : null].filter(Boolean);
    if (descriptions.length) picker.setAttribute('aria-describedby', descriptions.join(' '));
    else picker.removeAttribute('aria-describedby');
  }
  $('remove-reference').disabled = state.inputs.reference.status === 'empty';
  $('analyze-button').disabled = !state.canAnalyze;
  $('export-button').disabled = !state.canExport;
  $('open-simulation').disabled = !state.result || !state.removableRelations.length;
  let status;
  if (state.error) status = state.error;
  else if (Object.values(state.inputs).some(input => input.status === 'loading')) status = 'Lecture et validation locales en cours… Tout résultat précédent est invalidé.';
  else if (Object.values(state.inputs).some(input => input.status === 'invalid')) status = 'Un fichier demande une correction. Consultez le message sous l’entrée concernée.';
  else if (state.result) status = `Analyse terminée : ${state.result.counts.gained} accès gagné${state.result.counts.gained > 1 ? 's' : ''}, ${state.result.counts.lost} accès perdu${state.result.counts.lost > 1 ? 's' : ''}. ${state.simulation ? 'Le rapport inclut aussi le retrait simulé, dans une section séparée.' : 'Le rapport correspond aux fichiers actuels.'}`;
  else if (state.canAnalyze) status = 'Les fichiers sont prêts. Lancez l’analyse pour calculer les accès effectifs.';
  else if (state.inputs.reference.status === 'waiting') status = 'La référence métier sera vérifiée dès qu’un fichier Après valide sera chargé.';
  else status = 'Chargez les deux instantanés ou utilisez l’exemple. Les résultats resteront dans cette session.';
  setText('status-message', status);
  $('status-message').classList.toggle('error', Boolean(state.error) || Object.values(state.inputs).some(input => input.status === 'invalid'));
}

function emptyState(title, description, symbol = '⇄') {
  $('results-empty').replaceChildren(element('span', 'empty-symbol', symbol), element('h3', '', title), element('p', '', description));
  $('results-empty').hidden = false;
}
function summaryCount(number, text) {
  const count = element('div', 'summary-count');
  count.append(element('strong', '', String(number)), element('span', '', text));
  return count;
}

function renderResults(state) {
  const focusedId = document.activeElement?.closest('[data-finding-id]')?.dataset.findingId;
  $('changes-view').setAttribute('aria-pressed', String(state.view === 'changes'));
  $('reference-view').setAttribute('aria-pressed', String(state.view === 'reference'));
  const result = state.result;
  const summary = $('results-summary');
  summary.replaceChildren();
  $('results-list').replaceChildren();
  $('results-columns').hidden = true;
  $('results-note').hidden = true;
  for (const id of ['changes-tab-count', 'reference-tab-count']) $(id).hidden = !result;
  if (result) {
    setText('changes-tab-count', String(result.changes.length));
    setText('reference-tab-count', result.reference.status === 'assessed' ? String(result.reference.findings.length) : '—');
  }
  if (!result) {
    emptyState('Votre comparaison commence ici', 'Chargez les instantanés Avant et Après, puis lancez l’analyse pour voir les changements réels d’accès.');
    return;
  }
  if (state.view === 'reference' && result.reference.status === 'not-assessed') {
    emptyState('Évaluation métier non réalisée', 'Aucune référence métier fournie. Pour identifier les droits non requis ou manquants, ajoutez une référence complète du périmètre Après, puis relancez l’analyse.', '↳');
    return;
  }
  const isChanges = state.view === 'changes';
  const findings = isChanges ? result.changes : result.reference.findings;
  if (isChanges) {
    summary.append(summaryCount(result.counts.gained, result.counts.gained > 1 ? 'accès gagnés' : 'accès gagné'), summaryCount(result.counts.lost, result.counts.lost > 1 ? 'accès perdus' : 'accès perdu'));
    summary.append(element('p', 'summary-caption', 'Un accès = une personne et une ressource.'));
  } else {
    summary.append(summaryCount(result.reference.counts.unneeded, 'non requis'), summaryCount(result.reference.counts.missing, result.reference.counts.missing > 1 ? 'requis manquants' : 'requis manquant'));
    const coverage = result.reference.coverage;
    summary.append(element('p', 'summary-caption', `Référence complète : ${coverage.people} personne(s) · ${coverage.resources} ressource(s) · ${coverage.required} droit(s) requis.`));
  }
  if (!findings.length) {
    if (isChanges) emptyState('Aucun changement d’accès effectif', 'Personne ne gagne ni ne perd de droit de lecture dans ce modèle. Des relations peuvent avoir changé sans modifier les accès.', '=');
    else emptyState('Aucun écart avec la référence fournie', 'Les accès Après correspondent aux besoins déclarés dans cette référence. La validité métier de ces besoins reste à vérifier par son auteur.', '=');
    return;
  }
  $('results-empty').hidden = true;
  $('results-columns').hidden = false;
  for (const finding of findings) {
    const li = element('li');
    const button = element('button', 'finding-button');
    button.type = 'button';
    button.dataset.findingId = finding.id;
    button.setAttribute('aria-pressed', String(finding.id === state.selectedId));
    const label = element('span');
    label.append(element('span', 'finding-person', finding.person.name), element('span', 'finding-resource', finding.resource.name));
    button.append(label, badge(finding.kind));
    button.addEventListener('click', () => session.selectFinding(finding.id));
    li.append(button);
    $('results-list').append(li);
    if (focusedId === finding.id) button.focus({ preventScroll: true });
  }
  $('results-note').textContent = isChanges
    ? 'Les gains et pertes décrivent une évolution. Ils ne déterminent pas si un droit est nécessaire au travail.'
    : 'Les écarts sont calculés selon les besoins déclarés. Une relation de groupe peut aussi accorder des droits nécessaires : aucune correction automatique n’est proposée.';
  $('results-note').hidden = false;
}

function renderPath(path) {
  const list = element('ol', 'path');
  list.setAttribute('aria-label', 'Chemin d’accès représentatif');
  path.nodes.forEach((node, index) => {
    const li = element('li', 'path-step');
    const nodeBox = element('div', `path-node ${node.kind}`);
    nodeBox.append(element('span', 'path-node-kind', NODE_KINDS[node.kind]), element('strong', 'path-node-name', node.name), element('span', 'path-node-id', node.id));
    if (node.change === 'added' || node.change === 'removed') nodeBox.append(element('span', 'node-change', node.change === 'added' ? 'Entité ajoutée' : 'Entité supprimée'));
    li.append(nodeBox);
    const edge = path.edges[index];
    if (edge) {
      const relation = element('div', `path-relation ${edge.change ? 'changed' : ''}`);
      const arrow = element('span', 'arrow', '↓');
      arrow.setAttribute('aria-hidden', 'true');
      relation.append(arrow, element('span', '', edge.kind === 'membership' ? 'Membre de' : 'Lecture'));
      if (edge.change) relation.append(element('span', 'edge-change', edge.change === 'added' ? 'Relation ajoutée' : 'Relation retirée'));
      li.append(relation);
    }
    list.append(li);
  });
  return list;
}

function renderContext(context, times = ['Avant', 'Après']) {
  const summary = element('dl', 'access-context');
  const entries = [
    [times[0], context.before ? 'Présent' : 'Absent', context.before ? 'present' : 'absent'],
    [times[1], context.after ? 'Présent' : 'Absent', context.after ? 'present' : 'absent'],
    ['Requis selon la référence', REQUIREMENT_LABELS[context.requirement], 'requirement'],
  ];
  for (const [label, value, className] of entries) {
    const item = element('div', `context-item ${className}`);
    item.append(element('dt', '', label), element('dd', '', value));
    summary.append(item);
  }
  return summary;
}

function explainCause(finding) {
  if (finding.kind === 'missing') return 'La référence déclare ce droit de lecture nécessaire, mais aucun chemin du modèle ne l’accorde Après.';
  if (finding.kind === 'unneeded') return 'Le chemin affiché accorde cet accès Après, alors que cette paire personne–ressource est absente des besoins déclarés dans la référence.';
  const changedEdges = finding.path.edges.flatMap((edge, index) => {
    if (!edge.change) return [];
    const from = finding.path.nodes[index].name;
    const to = finding.path.nodes[index + 1].name;
    const relation = edge.kind === 'membership'
      ? `appartenance ${edge.change === 'added' ? 'ajoutée' : 'retirée'}`
      : `droit de lecture ${edge.change === 'added' ? 'ajouté' : 'retiré'}`;
    return [`${from} → ${to} (${relation})`];
  });
  const details = changedEdges.length
    ? `Sur le chemin représentatif ${finding.kind === 'lost' ? 'historique ' : ''}affiché, ${changedEdges.length === 1 ? 'la relation modifiée est' : 'les relations modifiées sont'} : ${changedEdges.join(' ; ')}.`
    : 'Le calcul compare tous les chemins pris en charge par le modèle.';
  return `${details} ${finding.kind === 'gained' ? 'Aucun chemin ne donnait cet accès Avant ; ce chemin l’accorde Après.' : 'Ce chemin donnait l’accès Avant ; aucun autre chemin ne le conserve Après.'}`;
}

function renderExplanation(state) {
  const content = $('explanation-content');
  const findings = !state.result ? [] : state.view === 'changes' ? state.result.changes : state.result.reference.findings;
  const finding = findings.find(item => item.id === state.selectedId);
  content.replaceChildren();
  if (!finding) {
    const placeholder = element('div', 'explanation-placeholder');
    const arrow = element('span', '', '↳');
    arrow.setAttribute('aria-hidden', 'true');
    placeholder.append(arrow, element('p', '', 'Sélectionnez un résultat pour suivre son chemin d’accès et examiner les preuves de ce constat.'));
    content.append(placeholder);
    return;
  }
  const heading = element('div', 'detail-heading');
  const identity = element('div');
  identity.append(element('h3', '', finding.person.name), element('p', 'detail-resource', finding.resource.name));
  heading.append(identity, badge(finding.kind));
  content.append(heading, renderContext(finding.context));
  if (finding.context.requirement === 'not-assessed') {
    content.append(element('p', 'context-note', 'Aucune référence fournie : la nécessité de ce droit n’est pas évaluée.'));
  } else if (finding.context.requirement === 'out-of-scope') {
    content.append(element('p', 'context-note', 'La personne ou la ressource n’existe plus dans Après. Cette paire est donc hors du périmètre couvert par la référence.'));
  }
  content.append(element('p', 'detail-description', LABELS[finding.kind].description));
  const cause = element('div', 'cause-box');
  cause.append(element('h4', '', 'Pourquoi ce constat ?'), element('p', '', explainCause(finding)));
  content.append(cause);
  const evidence = element('p', 'evidence-label');
  evidence.append(element('span', 'snapshot-badge', finding.snapshot === 'before' ? 'AVANT' : 'APRÈS'), element('span', '', finding.kind === 'missing' ? 'Besoin déclaré, accès absent' : 'Un chemin représentatif'));
  content.append(evidence);
  if (finding.kind === 'missing') {
    const requirement = element('div', 'requirement-box');
    requirement.append(element('h4', '', 'Lecture requise selon la référence'));
    const entry = element('p');
    entry.append(element('code', '', `requiredRead[${finding.referenceEntryIndex}]`));
    const ids = element('p');
    ids.append(element('code', '', `${finding.person.id} → ${finding.resource.id}`));
    requirement.append(entry, element('p', '', `${finding.person.name} → ${finding.resource.name}`), ids, element('p', '', 'Aucun chemin d’accès dans l’instantané Après. Il n’y a donc pas de chemin accordant ce droit à afficher.'));
    content.append(requirement);
  } else {
    content.append(renderPath(finding.path));
  }
  const notes = finding.kind === 'lost'
    ? 'Ce chemin est une preuve historique tirée d’Avant. Toutes ses relations retirées sont annotées. Le chemin représentatif ne désigne ni une cause unique ni une modification à appliquer.'
    : finding.kind === 'missing'
      ? 'Cette conclusion associe le besoin explicite de la référence à l’absence d’accès Après. La référence déclare les besoins ; l’application ne les devine pas.'
      : finding.kind === 'unneeded'
        ? 'Ce chemin accorde réellement l’accès Après. La recherche des écarts porte aussi sur les accès inchangés. Ce droit est non requis selon la référence fournie.'
        : 'Toutes les routes prises en charge participent au calcul. Chaque relation ajoutée sur ce chemin est annotée. Le chemin représentatif ne désigne ni une cause unique ni une modification à appliquer.';
  content.append(element('p', 'evidence-note', notes));
}

function simulationBadge(finding) {
  const retained = finding.kind === 'retained';
  const required = finding.context.requirement === 'required';
  const notRequired = finding.context.requirement === 'not-required';
  const kind = retained ? 'retained' : required ? 'missing' : notRequired ? 'unneeded' : 'lost';
  const text = retained ? '↳ Conservé' : required ? '! Requis perdu' : notRequired ? '− Non requis retiré' : '− Accès perdu';
  return element('span', `finding-badge ${kind}`, text);
}

function renderSimulationDetail(simulation, findings) {
  const content = $('simulation-detail');
  content.replaceChildren();
  const finding = findings.find(item => item.id === selectedSimulationId);
  if (!finding) {
    content.append(element('p', 'context-note', 'Cette relation ne contribue à aucun accès effectif dans Après. Aucun accès n’est perdu ou à conserver par un autre chemin.'));
    return;
  }
  const retained = finding.kind === 'retained';
  const heading = element('div', 'detail-heading');
  const identity = element('div');
  identity.append(element('h4', '', finding.person.name), element('p', 'detail-resource', finding.resource.name));
  heading.append(identity, simulationBadge(finding));
  content.append(heading, renderContext(finding.context, ['Après courant', 'Scénario']));
  const cause = element('div', 'cause-box');
  cause.append(element('h4', '', retained ? 'Un autre chemin conserve cet accès' : 'Cet accès disparaît avec le retrait'));
  cause.append(element('p', '', retained
    ? 'Une route dans Après passait par la relation testée. Le chemin du scénario présenté ci-dessous évite cette relation et accorde toujours l’accès.'
    : 'Le chemin ci-dessous accordait l’accès dans Après courant. Le retrait testé est annoté. Aucun autre chemin du modèle ne conserve cet accès dans le scénario.'));
  content.append(cause);
  if (!retained && finding.context.requirement === 'required') {
    const missing = simulation.reference.findings.find(item => item.kind === 'missing'
      && item.person.id === finding.person.id && item.resource.id === finding.resource.id);
    const requirement = element('div', 'requirement-box');
    requirement.append(element('h4', '', 'Un besoin déclaré devient manquant'), element('p', '', 'Ce droit est présent dans Après courant et requis selon la référence. Il ne serait plus accordé après ce retrait.'));
    if (missing) requirement.append(element('code', '', `requiredRead[${missing.referenceEntryIndex}]`));
    content.append(requirement);
  } else if (finding.context.requirement === 'not-assessed') {
    content.append(element('p', 'context-note simulation-context-note', 'Sans référence métier, la nécessité de cet accès n’est pas évaluée.'));
  }
  const evidence = element('p', 'evidence-label');
  evidence.append(element('span', 'snapshot-badge', retained ? 'SCÉNARIO' : 'APRÈS COURANT'), element('span', '', retained ? 'Chemin conservé après le retrait' : 'Chemin avant le retrait simulé'));
  content.append(evidence, renderPath(finding.path));
}

function simulationMetric(value, label, note, className = '') {
  const card = element('div', `simulation-metric ${className}`);
  card.append(element('strong', '', value === null ? '—' : String(value)), element('span', '', label), element('p', '', note));
  return card;
}

function renderSimulation(state) {
  const panel = $('simulation-section');
  const selector = $('simulation-relation');
  panel.hidden = !state.result;
  if (relationResult !== state.result) {
    relationResult = state.result;
    selector.replaceChildren(element('option', '', 'Choisir une relation à tester'));
    selector.options[0].value = '';
    for (const relation of state.removableRelations) {
      const option = element('option', '', `${relation.kind === 'membership' ? 'Appartenance' : 'Lecture'} · ${relation.from.name} → ${relation.to.name} (${relation.from.id} → ${relation.to.id})`);
      option.value = relation.id;
      selector.append(option);
    }
  }
  const simulation = state.simulation;
  const noRelations = !state.removableRelations.length;
  selector.disabled = !state.result || noRelations;
  $('simulate-button').disabled = !state.result || !selector.value;
  $('reset-simulation').disabled = !simulation;
  $('simulation-output').hidden = !simulation;
  $('simulation-status').classList.toggle('error', Boolean(state.simulationError));
  setText('simulation-status', state.simulationError ?? (noRelations
    ? 'Après ne contient aucune relation à retirer.'
    : simulation ? `Retrait simulé : ${simulation.counts.lost} accès perdu(s), ${simulation.retained.length} accès conservé(s) par un autre chemin. Le rapport inclut ce scénario.`
      : selector.value ? 'Relation sélectionnée. Lancez le test ; il repartira de l’instantané Après.'
        : 'Choisissez une relation pour examiner les conséquences de son retrait.'));
  if (displayedSimulation !== simulation) {
    displayedSimulation = simulation;
    // Start with the consequence that would interrupt a declared business need.
    selectedSimulationId = simulation?.changes.find(item => item.context.requirement === 'required')?.id
      ?? simulation?.changes[0]?.id ?? simulation?.retained[0]?.id ?? null;
  }
  if (!simulation) return;
  const relation = simulation.relation;
  setText('simulation-relation-title', `${relation.from.name} → ${relation.to.name}`);
  setText('simulation-relation-ids', `${relation.kind === 'membership' ? 'Appartenance retirée' : 'Autorisation de lecture retirée'} · ${relation.from.id} → ${relation.to.id}`);
  const assessed = simulation.impact.status === 'assessed';
  $('simulation-summary').replaceChildren(
    simulationMetric(simulation.counts.lost, 'Accès perdus', 'Paires personne / ressource'),
    simulationMetric(simulation.impact.removedUnneeded, 'Non requis retirés', assessed ? 'Selon la référence fournie' : 'Besoin métier non évalué'),
    simulationMetric(simulation.impact.newlyMissing, 'Requis nouvellement manquants', assessed ? 'Introduits par ce retrait' : 'Besoin métier non évalué', simulation.impact.newlyMissing > 0 ? 'attention' : ''),
    simulationMetric(simulation.impact.alreadyMissing, 'Requis déjà manquants', assessed ? 'Déjà absents dans Après courant' : 'Besoin métier non évalué'),
    simulationMetric(simulation.retained.length, 'Accès conservés', 'Une autre route reste présente'),
  );
  setText('simulation-reference-note', assessed
    ? `Dans tout le périmètre du scénario : ${simulation.impact.remainingUnneeded} accès non requis restent présents selon la référence. Les besoins déclarés restent à vérifier par son auteur.`
    : 'Aucune référence métier fournie : les pertes et chemins conservés sont calculés, mais leur effet sur les besoins métier n’est pas évalué.');
  const focusedId = document.activeElement?.closest('[data-simulation-id]')?.dataset.simulationId;
  const findings = [...simulation.changes, ...simulation.retained];
  $('simulation-list').replaceChildren();
  for (const finding of findings) {
    const li = element('li');
    const button = element('button', 'finding-button');
    button.type = 'button';
    button.dataset.simulationId = finding.id;
    button.setAttribute('aria-pressed', String(finding.id === selectedSimulationId));
    const label = element('span');
    label.append(element('span', 'finding-person', finding.person.name), element('span', 'finding-resource', finding.resource.name));
    button.append(label, simulationBadge(finding));
    button.addEventListener('click', () => {
      selectedSimulationId = finding.id;
      renderSimulation(session.getState());
    });
    li.append(button);
    $('simulation-list').append(li);
    if (focusedId === finding.id) button.focus({ preventScroll: true });
  }
  $('simulation-empty').hidden = findings.length > 0;
  setText('simulation-empty', 'Cette relation ne contribue à aucun accès effectif dans Après. Aucun accès n’est perdu.');
  const newlyMissing = new Set(simulation.changes.filter(item => item.context.requirement === 'required').map(item => JSON.stringify([item.person.id, item.resource.id])));
  const alreadyMissing = simulation.reference.findings.filter(item => item.kind === 'missing' && !newlyMissing.has(JSON.stringify([item.person.id, item.resource.id])));
  $('simulation-existing').hidden = !alreadyMissing.length;
  setText('simulation-existing-title', `${alreadyMissing.length} droit(s) requis déjà manquant(s) avant ce test`);
  $('simulation-existing-list').replaceChildren(...alreadyMissing.map(item => element('li', '', `${item.person.name} → ${item.resource.name} · requiredRead[${item.referenceEntryIndex}]`)));
  renderSimulationDetail(simulation, findings);
}

function render(state) { renderInputs(state); renderResults(state); renderExplanation(state); renderSimulation(state); }
session.subscribe(render);
render(session.getState());
