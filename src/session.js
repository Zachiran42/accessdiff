import { parseSnapshot } from './snapshot.js';
import { parseReference, validateReference, analyzeAccess } from './policy.js';
import { listRemovableRelations, simulateRemoval as calculateRemoval } from './simulation.js';

const ROLES = ['before', 'after', 'reference'];
const LABELS = { before: 'Avant', after: 'Après', reference: 'Référence métier' };
const MAX_BYTES = 256 * 1024;
const emptyInput = (token = 0) => ({ token, name: null, status: 'empty', value: null, error: null, parseError: null });
const messageOf = error => error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';

/** A page-lifetime session. Reads carry per-input tokens; reports carry a revision. */
export function createSession() {
  const inputs = Object.fromEntries(ROLES.map(role => [role, emptyInput()]));
  const listeners = new Set();
  let revision = 0;
  let result = null;
  let error = null;
  let view = 'changes';
  let selectedId = null;
  let simulation = null;
  let simulationError = null;
  let removableRelations = [];
  let exportResult = null;

  function isCurrent() { return result !== null && result.revision === revision; }
  function canAnalyze() {
    return inputs.before.status === 'valid' && inputs.after.status === 'valid'
      && ['empty', 'valid'].includes(inputs.reference.status);
  }
  function getState() {
    return {
      inputs: Object.fromEntries(ROLES.map(role => [role, { ...inputs[role] }])),
      revision, result: isCurrent() ? result : null, error, view, selectedId,
      simulation: isCurrent() ? simulation : null, simulationError,
      removableRelations: isCurrent() ? removableRelations : [],
      canAnalyze: canAnalyze(), canExport: isCurrent(),
    };
  }
  function emit() { for (const listener of listeners) listener(getState()); }
  function clearSimulation() {
    simulation = null; simulationError = null;
    exportResult = isCurrent() ? result : null;
  }
  function invalidate() {
    revision += 1; result = null; selectedId = null; error = null;
    removableRelations = []; clearSimulation();
  }
  function assertRole(role) { if (!ROLES.includes(role)) throw new Error('Rôle de fichier inconnu.'); }

  function revalidateReference() {
    const reference = inputs.reference;
    if (reference.status === 'empty' || reference.status === 'loading' || reference.parseError) return;
    if (inputs.after.status !== 'valid') {
      reference.status = 'waiting';
      reference.error = null;
      return;
    }
    try {
      validateReference(reference.value, inputs.after.value);
      reference.status = 'valid';
      reference.error = null;
    } catch (caught) {
      reference.status = 'invalid';
      reference.error = messageOf(caught);
    }
  }

  function begin(role, name) {
    assertRole(role);
    invalidate();
    const token = inputs[role].token + 1;
    inputs[role] = { ...emptyInput(token), name, status: 'loading' };
    if (role === 'after') revalidateReference();
    emit();
    return token;
  }

  function parse(role, text) {
    return role === 'reference'
      ? parseReference(text, { label: LABELS[role] })
      : parseSnapshot(text, { label: LABELS[role] });
  }

  function finish(role, token, text, readError = null) {
    if (inputs[role].token !== token) return false;
    const input = inputs[role];
    try {
      if (readError) throw readError;
      input.value = parse(role, text);
      input.status = 'valid';
      input.error = null;
      input.parseError = null;
    } catch (caught) {
      input.value = null;
      input.status = 'invalid';
      input.error = messageOf(caught);
      input.parseError = input.error;
    }
    revalidateReference();
    emit();
    return true;
  }

  async function loadFile(role, file) {
    const token = begin(role, file.name);
    try {
      if (file.size > MAX_BYTES) throw new Error(`${LABELS[role]} : le fichier dépasse la limite de 256 Kio.`);
      const text = await file.text();
      return finish(role, token, text);
    } catch (caught) {
      return finish(role, token, null, caught);
    }
  }

  function loadText(role, text, name = `${role}.json`) {
    const token = begin(role, name);
    return finish(role, token, text);
  }

  /** loader returns all three {text, name} entries. Commit the example atomically. */
  async function loadExample(loader) {
    invalidate();
    const tokens = {};
    for (const role of ROLES) {
      tokens[role] = inputs[role].token + 1;
      inputs[role] = { ...emptyInput(tokens[role]), status: 'loading', name: `Exemple · ${LABELS[role]}` };
    }
    emit();
    const ownsAll = () => ROLES.every(role => inputs[role].token === tokens[role]);
    function abandon() {
      for (const role of ROLES) {
        if (inputs[role].token === tokens[role]) inputs[role] = emptyInput(tokens[role]);
      }
      revalidateReference();
      emit();
    }
    try {
      const files = await loader();
      if (!ownsAll()) { abandon(); return false; }
      const values = Object.fromEntries(ROLES.map(role => [role, parse(role, files[role].text)]));
      validateReference(values.reference, values.after);
      if (!ownsAll()) { abandon(); return false; }
      for (const role of ROLES) {
        inputs[role] = { ...emptyInput(tokens[role]), name: files[role].name, status: 'valid', value: values[role] };
      }
      emit();
      return true;
    } catch (caught) {
      if (!ownsAll()) { abandon(); return false; }
      for (const role of ROLES) inputs[role] = emptyInput(tokens[role]);
      error = `Exemple indisponible : ${messageOf(caught)}`;
      emit();
      return false;
    }
  }

  function removeReference() {
    invalidate();
    inputs.reference = emptyInput(inputs.reference.token + 1);
    emit();
  }

  function analyze() {
    result = null;
    selectedId = null;
    error = null;
    removableRelations = [];
    clearSimulation();
    if (!canAnalyze()) {
      error = 'Chargez des fichiers Avant et Après valides. Corrigez ou retirez toute référence métier invalide.';
      emit();
      return null;
    }
    const analyzedRevision = revision;
    try {
      const analysis = analyzeAccess(inputs.before.value, inputs.after.value, inputs.reference.value);
      const relations = listRemovableRelations(inputs.after.value);
      if (revision !== analyzedRevision) return null;
      result = {
        ...analysis,
        inputs: { before: inputs.before.name, after: inputs.after.name, reference: inputs.reference.name },
        generatedAt: new Date().toISOString(), revision: analyzedRevision,
      };
      removableRelations = relations;
      exportResult = result;
    } catch (caught) {
      error = `Analyse impossible : ${messageOf(caught)}`;
    }
    emit();
    return result;
  }

  function setView(nextView) {
    if (!['changes', 'reference'].includes(nextView)) throw new Error('Vue inconnue.');
    view = nextView;
    selectedId = null;
    emit();
  }
  function selectFinding(id) {
    const findings = !isCurrent() ? [] : view === 'changes' ? result.changes : result.reference.findings;
    selectedId = findings.some(finding => finding.id === id) ? id : null;
    emit();
  }
  function simulateRemoval(relationId) {
    clearSimulation();
    if (!isCurrent()) {
      simulationError = 'Analysez les fichiers courants avant de tester un retrait.';
      emit();
      return null;
    }
    try {
      simulation = {
        ...calculateRemoval(inputs.after.value, inputs.reference.value, relationId),
        generatedAt: new Date().toISOString(), revision,
      };
      exportResult = { ...result, simulation };
    } catch (caught) {
      simulationError = `Simulation impossible : ${messageOf(caught)}`;
    }
    emit();
    return simulation;
  }
  function resetSimulation() { clearSimulation(); emit(); }
  function getExportResult() { return isCurrent() ? exportResult : null; }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

  return { getState, subscribe, loadFile, loadText, loadExample, removeReference, analyze, setView, selectFinding, simulateRemoval, resetSimulation, getExportResult };
}
