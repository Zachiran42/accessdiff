const KIND_LABELS = {
  gained: 'Accès gagné',
  lost: 'Accès perdu',
  unneeded: 'Accès non requis selon la référence',
  missing: 'Droit nécessaire manquant',
  retained: 'Accès conservé par un autre chemin',
};
const NODE_LABELS = { person: 'Personne', group: 'Groupe', resource: 'Ressource' };
const REQUIREMENT_LABELS = {
  required: 'Oui',
  'not-required': 'Non',
  'not-assessed': 'Non évalué',
  'out-of-scope': 'Hors périmètre Après',
};

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function identity(entity) {
  return `${escapeText(entity.name)} <span class="identifier">(${escapeText(entity.id)})</span>`;
}

function accessContext(finding, simulation = false) {
  const context = finding.context;
  if (!context || typeof context.before !== 'boolean' || typeof context.after !== 'boolean'
    || !Object.hasOwn(REQUIREMENT_LABELS, context.requirement)) {
    throw new Error('Le contexte Avant / Après et le besoin déclaré doivent être complets pour exporter un constat.');
  }
  return `<dl class="access-summary">
    <div><dt>${simulation ? 'Après courant' : 'Avant'}</dt><dd>${context.before ? 'Présent' : 'Absent'}</dd></div>
    <div><dt>${simulation ? 'Scénario' : 'Après'}</dt><dd>${context.after ? 'Présent' : 'Absent'}</dd></div>
    <div><dt>Besoin déclaré</dt><dd>${REQUIREMENT_LABELS[context.requirement]}</dd></div>
  </dl>`;
}

function changeCause(finding, nodeById, simulation = false) {
  if (finding.kind !== 'gained' && finding.kind !== 'lost') return '';
  const changed = finding.path.edges.filter(edge => edge.change === 'added' || edge.change === 'removed');
  if (!changed.length) return '';
  const sentences = changed.map(edge => {
    const source = nodeById.get(edge.fromId);
    const target = nodeById.get(edge.toId);
    if (!source || !target) throw new Error('Un chemin incomplet ne peut pas être exporté.');
    const relation = edge.kind === 'membership'
      ? `L’appartenance de ${escapeText(source.name)} au groupe ${escapeText(target.name)}`
      : `L’autorisation de lecture de ${escapeText(source.name)} vers ${escapeText(target.name)}`;
    return `${relation} a été ${edge.change === 'added' ? 'ajoutée' : 'retirée'}.`;
  });
  return `<p class="cause"><strong>${simulation ? 'Modification simulée dans le chemin présenté' : 'Ce qui a changé dans le chemin présenté'} :</strong> ${sentences.join(' ')}</p>`;
}

function pathExplanation(finding, simulation = false) {
  if (finding.kind === 'missing') {
    return `<p>Besoin déclaré : <code>requiredRead[${escapeText(finding.referenceEntryIndex)}]</code>, dans le fichier de référence fourni. Aucun chemin d’accès en lecture n’existe dans ${simulation ? 'le scénario' : 'Après'}, selon le modèle pris en charge.</p>`;
  }

  const path = finding.path;
  if (!path || !Array.isArray(path.nodes) || !Array.isArray(path.edges)) {
    throw new Error('Un résultat sans chemin valide ne peut pas être exporté.');
  }
  const nodeById = new Map(path.nodes.map(node => [node.id, node]));
  const steps = path.nodes.map(node => {
    const entityChange = node.change === 'added'
      ? ' — Entité ajoutée'
      : node.change === 'removed' ? ' — Entité supprimée' : '';
    return `<li><span class="role">${escapeText(NODE_LABELS[node.kind] ?? node.kind)}${entityChange}</span> ${identity(node)}</li>`;
  }).join('');
  const relationships = path.edges.map(edge => {
    const source = nodeById.get(edge.fromId);
    const target = nodeById.get(edge.toId);
    if (!source || !target) throw new Error('Un chemin incomplet ne peut pas être exporté.');
    const relationship = edge.kind === 'membership' ? 'Appartenance' : 'Autorisation de lecture';
    const change = edge.change === 'added'
      ? 'Ajoutée'
      : edge.change === 'removed'
        ? 'Retirée'
        : simulation
          ? finding.kind === 'lost' ? 'Présente dans Après courant' : 'Présente dans le scénario'
          : finding.kind === 'unneeded' ? 'Présente dans Après' : 'Présente dans les deux instantanés';
    return `<li>${identity(source)} → ${identity(target)} : ${relationship}. <strong>${change}.</strong></li>`;
  }).join('');
  const lossNote = finding.kind === 'lost'
    ? simulation
      ? '<p>Ce chemin existe dans Après courant. Aucun autre chemin d’accès en lecture ne subsiste dans le scénario selon le modèle pris en charge.</p>'
      : '<p>Ce chemin appartenait à Avant. Aucun autre chemin d’accès en lecture ne subsiste dans Après selon le modèle pris en charge.</p>'
    : finding.kind === 'retained'
      ? '<p>Ce chemin conserve l’accès dans le scénario sans utiliser la relation retirée. Le retrait simulé ne supprime donc pas cet accès.</p>'
      : '';
  const phase = simulation
    ? finding.snapshot === 'before' ? 'Après courant' : 'le scénario'
    : finding.snapshot === 'before' ? 'Avant' : 'Après';
  return `${changeCause(finding, nodeById, simulation)}
    <p>Chemin représentatif dans <strong>${phase}</strong>. Un chemin valide est présenté ; tous les chemins pris en charge contribuent au calcul.</p>
    <ol class="path">${steps}</ol>
    <h4>Relations de ce chemin</h4><ul>${relationships}</ul>${lossNote}`;
}

function findingCard(finding, simulation = false) {
  return `<article class="finding">
    <h3>${escapeText(KIND_LABELS[finding.kind] ?? finding.kind)} — ${escapeText(finding.person.name)} → ${escapeText(finding.resource.name)}</h3>
    <p><strong>Personne :</strong> ${identity(finding.person)}<br><strong>Ressource :</strong> ${identity(finding.resource)}</p>
    ${accessContext(finding, simulation)}
    ${pathExplanation(finding, simulation)}
  </article>`;
}

function simulationSection(simulation) {
  if (simulation === null || simulation === undefined) return '';
  const { relation, changes, counts, reference, impact, retained } = simulation;
  if (!relation || !relation.from || !relation.to || !['membership', 'grant'].includes(relation.kind)
    || !Array.isArray(changes) || !counts || !reference || !Array.isArray(reference.findings)
    || !impact || !['assessed', 'not-assessed'].includes(impact.status) || !Array.isArray(retained)
    || (impact.status === 'assessed') !== (reference.status === 'assessed')) {
    throw new Error('La simulation doit être complète pour être exportée.');
  }
  const relationLabel = relation.kind === 'membership' ? 'Appartenance' : 'Autorisation de lecture';
  const assessed = impact.status === 'assessed';
  let businessImpact;
  if (assessed) {
    for (const field of ['removedUnneeded', 'newlyMissing', 'alreadyMissing', 'remainingUnneeded']) {
      if (!Number.isInteger(impact[field]) || impact[field] < 0) throw new Error('Les effets métier de la simulation sont incomplets.');
    }
    const newlyMissing = new Set(changes.filter(finding => finding.kind === 'lost' && finding.context?.requirement === 'required')
      .map(finding => JSON.stringify([finding.person.id, finding.resource.id])));
    const alreadyMissing = reference.findings.filter(finding => finding.kind === 'missing'
      && !newlyMissing.has(JSON.stringify([finding.person.id, finding.resource.id])));
    businessImpact = `<h3>Effets selon la référence métier fournie</h3>
      <dl class="access-summary">
        <div><dt>Accès non requis retirés</dt><dd>${impact.removedUnneeded}</dd></div>
        <div><dt>Droits nécessaires nouvellement manquants</dt><dd>${impact.newlyMissing}</dd></div>
        <div><dt>Droits nécessaires déjà manquants</dt><dd>${impact.alreadyMissing}</dd></div>
        <div><dt>Accès non requis restants</dt><dd>${impact.remainingUnneeded}</dd></div>
      </dl>
      <p>Les droits nouvellement manquants sont introduits par ce retrait fictif. Les droits déjà manquants étaient absents dans Après courant et ne sont pas causés par la simulation. Les besoins sont ceux de la référence déclarée ; leur exactitude métier n’est pas vérifiée.</p>
      <h3>Droits nécessaires déjà manquants avant la simulation</h3>
      ${alreadyMissing.length ? alreadyMissing.map(finding => findingCard(finding, true)).join('\n') : '<p>Aucun droit nécessaire n’était déjà manquant dans Après courant.</p>'}`;
  } else {
    businessImpact = '<p><strong>Impact métier non évalué.</strong> Aucune référence métier n’a été fournie. Les pertes et accès conservés sont calculés, mais il est impossible de distinguer les accès nécessaires des accès non requis.</p>';
  }
  return `<section class="simulation"><h2>Simulation — retrait d’une relation</h2>
    <p><strong>Retrait fictif unique.</strong> La base est Après courant, issu du fichier Après analysé. Le scénario retire seulement la relation choisie dans une copie temporaire. Les différences Avant / Après présentées plus haut restent celles de l’analyse initiale. Aucun fichier d’entrée ni système réel n’est modifié.</p>
    <p><strong>${relationLabel} retirée :</strong> ${identity(relation.from)} → ${identity(relation.to)}.<br><strong>Identifiant de la relation :</strong> <code>${escapeText(relation.id)}</code></p>
    <dl><dt>Simulation générée le</dt><dd>${escapeText(simulation.generatedAt)}</dd><dt>Révision de la simulation</dt><dd>${escapeText(simulation.revision)}</dd></dl>
    <p><strong>${escapeText(counts.lost)}</strong> accès perdus · <strong>${escapeText(counts.gained)}</strong> accès gagnés entre Après courant et le scénario. Les comptes désignent des paires personne / ressource.</p>
    <h3>Changements d’accès causés par le retrait fictif</h3>
    ${changes.length ? changes.map(finding => findingCard(finding, true)).join('\n') : '<p>Aucun accès effectif ne change après ce retrait fictif.</p>'}
    <h3>Accès conservés par un autre chemin</h3>
    <p>Ces accès pouvaient passer par la relation retirée. Un autre chemin subsiste dans le scénario ; ils ne sont pas comptés comme des pertes.</p>
    ${retained.length ? retained.map(finding => findingCard(finding, true)).join('\n') : '<p>Aucun accès passant par cette relation n’est conservé par un autre chemin.</p>'}
    ${businessImpact}
    <p>Cette simulation décrit les effets calculés selon le modèle et les fichiers fournis. Elle ne constitue ni une validation de suppression ni une correction automatique.</p>
  </section>`;
}

/** Render every current finding as a standalone document with text-only data. */
export function createReport(result) {
  if (!result || !Array.isArray(result.changes) || !result.counts || !result.inputs
    || !result.reference || !Array.isArray(result.reference.findings)) {
    throw new Error('Aucune analyse complète à exporter.');
  }
  const assessed = result.reference.status === 'assessed';
  const comparison = result.changes.length
    ? result.changes.map(finding => findingCard(finding)).join('\n')
    : '<p>Aucune différence d’accès effectif : personne ne gagne ni ne perd d’accès en lecture selon le modèle pris en charge.</p>';
  let assessment;
  if (assessed) {
    const { coverage, counts, findings } = result.reference;
    if (!coverage || !counts) throw new Error('La couverture de référence manque au rapport.');
    assessment = `<p><strong>Évaluation réalisée à partir de la référence fournie.</strong></p>
      <p>Couverture exhaustive d’Après : ${escapeText(coverage.people)} personnes, ${escapeText(coverage.resources)} ressources, ${escapeText(coverage.required)} droits de lecture déclarés nécessaires. Toute paire omise est déclarée non requise.</p>
      <p>${escapeText(counts.unneeded)} accès non requis selon la référence · ${escapeText(counts.missing)} droits nécessaires manquants.</p>
      <p>Tout accès absent de cette liste est considéré comme non requis. L’auteur de la référence déclare les besoins métier : la validation du format et du périmètre ne vaut pas approbation métier et ne confirme pas l’exactitude de ces besoins.</p>
      ${findings.length ? findings.map(finding => findingCard(finding)).join('\n') : '<p>Aucun écart avec la référence fournie. Ce résultat ne certifie ni la sécurité ni la conformité d’un système réel.</p>'}`;
  } else {
    assessment = '<p><strong>Évaluation du moindre privilège non réalisée.</strong> Aucune référence métier n’a été fournie. Les différences observées ne permettent pas de décider si un accès est nécessaire.</p>';
  }
  const referenceFile = result.inputs.reference === null || result.inputs.reference === undefined
    ? 'Non fournie'
    : escapeText(result.inputs.reference);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AccessDiff — Rapport de comparaison</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172d3b; background: #f4f7f8; }
    body { max-width: 960px; margin: 0 auto; padding: 36px 24px; line-height: 1.6; }
    header, section { padding: 24px; margin-bottom: 22px; background: #fff; border: 1px solid #d8e2e7; border-radius: 10px; }
    h1, h2, h3, h4 { line-height: 1.3; color: #24485b; }
    h1 { margin-top: 0; } h3 { font-size: 1.1rem; }
    p, li, code { overflow-wrap: anywhere; }
    dt { font-weight: 600; margin-top: 8px; } dd { margin-left: 0; }
    .access-summary { display: flex; flex-wrap: wrap; gap: 16px 32px; padding: 12px 16px; background: #f4f7f8; border-radius: 6px; }
    .access-summary dt { margin-top: 0; color: #52646f; } .access-summary dd { font-weight: 650; }
    .cause { border-left: 3px solid #8ca8b6; padding-left: 12px; }
    .finding { border-top: 1px solid #d8e2e7; margin-top: 24px; padding-top: 12px; }
    .identifier, .role { color: #52646f; font-size: .9em; }
    .path { border-left: 3px solid #277e78; padding-left: 32px; }
    .path li { padding: 3px 0; } .role { display: block; }
    @media print { :root { background: #fff; } body { max-width: none; padding: 0; font-size: 10pt; } header, section { border: 0; border-radius: 0; padding: 0 0 16px; } h2, h3, h4 { break-after: avoid; } .path { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>AccessDiff</h1><p>Rapport de comparaison des accès en lecture</p>
    <dl><dt>Fichier Avant</dt><dd>${escapeText(result.inputs.before)}</dd>
      <dt>Fichier Après</dt><dd>${escapeText(result.inputs.after)}</dd>
      <dt>Référence métier</dt><dd>${referenceFile}</dd>
      <dt>Généré le</dt><dd>${escapeText(result.generatedAt)}</dd>
      <dt>Révision analysée</dt><dd>${escapeText(result.revision)}</dd></dl>
    <p>Traitement local dans le navigateur. Ce rapport téléchargé est un fichier distinct, sous le contrôle de son destinataire.</p>
  </header>
  <section><h2>Différences Avant / Après</h2>
    <p><strong>${escapeText(result.counts.gained)}</strong> accès gagnés · <strong>${escapeText(result.counts.lost)}</strong> accès perdus. Les comptes désignent des paires personne / ressource.</p>
    ${comparison}
  </section>
  <section><h2>Écarts avec les besoins métier</h2>${assessment}</section>
  ${simulationSection(result.simulation)}
  <section><h2>Modèle et limites</h2>
    <ul><li>Lecture seule, autorisations positives, appartenances directes ou groupes imbriqués, ressources sans hiérarchie. Une autorisation existe dès qu’un chemin valide la fournit.</li>
      <li>Le calcul examine tous les chemins pris en charge ; chaque explication présente un seul chemin représentatif. Une relation peut participer à plusieurs droits.</li>
      <li>Les noms, identités, relations et besoins sont ceux des fichiers fournis. La correspondance avec un annuaire réel doit être établie par leur auteur.</li>
      <li>Les refus explicites, les autres permissions, l’héritage Windows, les règles conditionnelles et l’ensemble des ACL Active Directory ne sont pas reproduits.</li>
      <li>Aucune correction n’est appliquée ou recommandée automatiquement. Un écart désigne une différence avec la référence déclarée, sans verdict général de sécurité ou de conformité.</li></ul>
  </section>
</body>
</html>`;
}
