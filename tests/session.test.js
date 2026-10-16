import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/session.js';

function snapshot(granted = false, people = [{ id: 'p:a', name: 'Alice' }]) {
  return JSON.stringify({ schemaVersion: 1, people, groups: [], resources: [{ id: 'r:a', name: 'Planning' }], memberships: [], grants: granted ? [{ subjectId: 'p:a', resourceId: 'r:a', permission: 'read' }] : [] });
}
function reference(peopleIds = ['p:a'], requiredRead = []) {
  return JSON.stringify({ schemaVersion: 1, coverage: 'all-after-pairs', peopleIds, resourceIds: ['r:a'], requiredRead });
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function file(name, pending, size = 100) { return { name, size, text: () => pending.promise }; }
function ready(session, withReference = false) {
  session.loadText('before', snapshot(), 'before.json');
  session.loadText('after', snapshot(true), 'after.json');
  if (withReference) session.loadText('reference', reference(), 'required.json');
  return session.analyze();
}
function example() {
  return { before: { name: 'example-before.json', text: snapshot() }, after: { name: 'example-after.json', text: snapshot(true) }, reference: { name: 'example-reference.json', text: reference() } };
}

test('starts empty, enables analysis only with valid snapshots, and records current report inputs', () => {
  const session = createSession();
  assert.equal(session.getState().canAnalyze, false);
  assert.equal(session.getExportResult(), null);
  session.loadText('before', snapshot(), '<before>.json');
  assert.equal(session.getState().canAnalyze, false);
  session.loadText('after', snapshot(true), 'after.json');
  assert.equal(session.getState().canAnalyze, true);
  assert.equal(session.getState().canExport, false);
  const result = session.analyze();
  assert.deepEqual(result.counts, { gained: 1, lost: 0 });
  assert.equal(result.reference.status, 'not-assessed');
  assert.deepEqual(result.inputs, { before: '<before>.json', after: 'after.json', reference: null });
  assert.equal(result.revision, session.getState().revision);
  assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
  assert.equal(session.getExportResult(), result);
});

test('replacement invalidates result, selection, and export before the asynchronous read completes', async () => {
  const session = createSession();
  const result = ready(session);
  session.selectFinding(result.changes[0].id);
  assert.ok(session.getState().selectedId);
  const pending = deferred();
  const task = session.loadFile('after', file('new-after.json', pending));
  const during = session.getState();
  assert.equal(during.inputs.after.status, 'loading');
  assert.equal(during.result, null);
  assert.equal(during.selectedId, null);
  assert.equal(during.canExport, false);
  assert.equal(during.canAnalyze, false);
  assert.equal(session.getExportResult(), null);
  pending.resolve(snapshot());
  await task;
  assert.equal(session.getState().canAnalyze, true);
  assert.equal(session.getState().canExport, false);
  assert.equal(session.analyze().changes.length, 0);
});

test('an older slow successful read cannot replace a newer selected file', async () => {
  const session = createSession();
  const older = deferred();
  const newer = deferred();
  const oldTask = session.loadFile('before', file('old.json', older));
  const newTask = session.loadFile('before', file('new.json', newer));
  newer.resolve(snapshot(true));
  await newTask;
  older.resolve(snapshot());
  assert.equal(await oldTask, false);
  assert.equal(session.getState().inputs.before.name, 'new.json');
  assert.equal(session.getState().inputs.before.value.grants.length, 1);
});

test('a stale failed read cannot overwrite a newer valid input with an error', async () => {
  const session = createSession();
  const pending = deferred();
  const oldTask = session.loadFile('after', file('old.json', pending));
  session.loadText('after', snapshot(), 'new.json');
  pending.reject(new Error('Ancienne lecture échouée'));
  assert.equal(await oldTask, false);
  assert.equal(session.getState().inputs.after.status, 'valid');
  assert.equal(session.getState().inputs.after.error, null);
});

test('Before and After reads complete independently in either order', async () => {
  const session = createSession();
  const before = deferred();
  const after = deferred();
  const beforeTask = session.loadFile('before', file('before.json', before));
  const afterTask = session.loadFile('after', file('after.json', after));
  after.resolve(snapshot(true));
  await afterTask;
  assert.equal(session.getState().inputs.after.status, 'valid');
  assert.equal(session.getState().inputs.before.status, 'loading');
  assert.equal(session.getState().canAnalyze, false);
  before.resolve(snapshot());
  await beforeTask;
  assert.equal(session.getState().canAnalyze, true);
});

test('a structurally invalid supplied reference blocks comparison until explicitly removed', () => {
  const session = createSession();
  ready(session);
  session.loadText('reference', '{"schemaVersion":1}', 'invalid-reference.json');
  assert.equal(session.getState().inputs.reference.status, 'invalid');
  assert.equal(session.getState().canAnalyze, false);
  assert.equal(session.analyze(), null);
  assert.equal(session.getExportResult(), null);
  session.removeReference();
  assert.equal(session.getState().canAnalyze, true);
  assert.equal(session.getState().inputs.reference.status, 'empty');
  assert.equal(session.analyze().reference.status, 'not-assessed');
});

test('reference coverage waits for After and is revalidated when After changes', async () => {
  const session = createSession();
  session.loadText('reference', reference(), 'required.json');
  assert.equal(session.getState().inputs.reference.status, 'waiting');
  session.loadText('before', snapshot());
  session.loadText('after', snapshot());
  assert.equal(session.getState().inputs.reference.status, 'valid');
  const pending = deferred();
  const task = session.loadFile('after', file('other-after.json', pending));
  assert.equal(session.getState().inputs.reference.status, 'waiting');
  pending.resolve(snapshot(false, [{ id: 'p:b', name: 'Béatrice' }]));
  await task;
  assert.equal(session.getState().inputs.reference.status, 'invalid');
  assert.equal(session.getState().canAnalyze, false);
  session.loadText('after', snapshot());
  assert.equal(session.getState().inputs.reference.status, 'valid');
  assert.equal(session.getState().canAnalyze, true);
});

test('reference removal invalidates export immediately and cancels an older pending reference', async () => {
  const session = createSession();
  ready(session, true);
  assert.equal(session.getState().canExport, true);
  session.removeReference();
  assert.equal(session.getState().canExport, false);
  const pending = deferred();
  const task = session.loadFile('reference', file('late-reference.json', pending));
  session.removeReference();
  pending.resolve(reference());
  assert.equal(await task, false);
  assert.equal(session.getState().inputs.reference.status, 'empty');
});

test('an example is committed with all three validated inputs and uses the real engine', async () => {
  const session = createSession();
  assert.equal(await session.loadExample(async () => example()), true);
  const state = session.getState();
  assert.ok(Object.values(state.inputs).every(input => input.status === 'valid'));
  const result = session.analyze();
  assert.deepEqual(result.counts, { gained: 1, lost: 0 });
  assert.equal(result.reference.counts.unneeded, 1);
});

test('manual selection wins over a pending example, without leaving its other entries loading', async () => {
  const session = createSession();
  const pending = deferred();
  const task = session.loadExample(() => pending.promise);
  session.loadText('before', snapshot(true), 'manual-before.json');
  pending.resolve(example());
  assert.equal(await task, false);
  const state = session.getState();
  assert.equal(state.inputs.before.name, 'manual-before.json');
  assert.equal(state.inputs.before.status, 'valid');
  assert.equal(state.inputs.after.status, 'empty');
  assert.equal(state.inputs.reference.status, 'empty');
  assert.equal(state.canExport, false);
});

test('a later example wins even when the earlier example completes last', async () => {
  const session = createSession();
  const first = deferred();
  const second = deferred();
  const firstTask = session.loadExample(() => first.promise);
  const secondTask = session.loadExample(() => second.promise);
  const newer = example();
  newer.after.name = 'latest-example.json';
  second.resolve(newer);
  assert.equal(await secondTask, true);
  first.resolve(example());
  assert.equal(await firstTask, false);
  assert.equal(session.getState().inputs.after.name, 'latest-example.json');
  assert.equal(session.getState().canAnalyze, true);
});

test('example failure does not silently retain old report or accept partial inputs', async () => {
  const session = createSession();
  ready(session);
  const bad = example();
  bad.reference.text = reference(['p:unknown']);
  assert.equal(await session.loadExample(async () => bad), false);
  assert.equal(session.getState().result, null);
  assert.ok(Object.values(session.getState().inputs).every(input => input.status === 'empty'));
  assert.match(session.getState().error, /Exemple indisponible/);
});

test('oversize files are rejected before text is read and invalidate previous report', async () => {
  const session = createSession();
  ready(session);
  let read = false;
  await session.loadFile('before', { name: 'huge.json', size: 256 * 1024 + 1, text: () => { read = true; return Promise.resolve(snapshot()); } });
  assert.equal(read, false);
  assert.equal(session.getState().inputs.before.status, 'invalid');
  assert.match(session.getState().inputs.before.error, /256 Kio/);
  assert.equal(session.getExportResult(), null);
});

test('view changes clear incompatible selection, and rows cannot be selected from another view', () => {
  const session = createSession();
  const result = ready(session, true);
  session.selectFinding(result.changes[0].id);
  assert.equal(session.getState().selectedId, result.changes[0].id);
  session.setView('reference');
  assert.equal(session.getState().selectedId, null);
  session.selectFinding(result.changes[0].id);
  assert.equal(session.getState().selectedId, null);
  session.selectFinding(result.reference.findings[0].id);
  assert.equal(session.getState().selectedId, result.reference.findings[0].id);
  session.loadText('before', snapshot());
  assert.equal(session.getState().selectedId, null);
});

test('cross-snapshot internal validation failure produces no partial result or export', () => {
  const session = createSession();
  session.loadText('before', snapshot());
  session.loadText('after', JSON.stringify({ schemaVersion: 1, people: [], groups: [{ id: 'p:a', name: 'A group' }], resources: [{ id: 'r:a', name: 'Planning' }], memberships: [], grants: [] }));
  assert.equal(session.getState().canAnalyze, true);
  assert.equal(session.analyze(), null);
  assert.match(session.getState().error, /Analyse impossible/);
  assert.equal(session.getState().canExport, false);
});

test('listeners receive the invalidated loading state and can unsubscribe', async () => {
  const session = createSession();
  ready(session);
  const observed = [];
  const stop = session.subscribe(state => observed.push({ status: state.inputs.after.status, canExport: state.canExport }));
  const pending = deferred();
  const task = session.loadFile('after', file('updated.json', pending));
  assert.deepEqual(observed[0], { status: 'loading', canExport: false });
  stop();
  pending.resolve(snapshot());
  await task;
  assert.equal(observed.length, 1);
});

test('simulation is unavailable before a current analysis and relation choices never survive invalidation', () => {
  const session = createSession();
  assert.equal(session.getState().simulation, null);
  assert.equal(session.getState().simulationError, null);
  assert.deepEqual(session.getState().removableRelations, []);
  assert.equal(session.simulateRemoval('unknown'), null);
  assert.match(session.getState().simulationError, /Analysez les fichiers courants/);
  assert.equal(session.getExportResult(), null);
  session.loadText('before', snapshot());
  session.loadText('after', snapshot(true));
  assert.equal(session.getState().simulationError, null);
  assert.deepEqual(session.getState().removableRelations, []);
  session.analyze();
  assert.equal(session.getState().removableRelations.length, 1);
  session.loadText('before', snapshot());
  assert.deepEqual(session.getState().removableRelations, []);
});

test('simulation preserves original findings, selection and view while providing a stable export of the active scenario', () => {
  const session = createSession();
  const original = ready(session, true);
  session.setView('reference');
  const selectedId = original.reference.findings[0].id;
  session.selectFinding(selectedId);
  const relationId = session.getState().removableRelations[0].id;
  const simulation = session.simulateRemoval(relationId);
  const state = session.getState();
  assert.equal(state.result, original);
  assert.equal(state.simulation, simulation);
  assert.equal(state.view, 'reference');
  assert.equal(state.selectedId, selectedId);
  assert.deepEqual(simulation.counts, { gained: 0, lost: 1 });
  assert.equal(simulation.revision, state.revision);
  assert.ok(Number.isFinite(Date.parse(simulation.generatedAt)));
  const exported = session.getExportResult();
  assert.notEqual(exported, original);
  assert.equal(exported.simulation, simulation);
  assert.equal(exported.changes, original.changes);
  assert.equal(session.getExportResult(), exported);
  session.selectFinding(selectedId);
  assert.equal(session.getExportResult(), exported);
  const next = session.simulateRemoval(relationId);
  assert.notEqual(next, simulation);
  assert.notEqual(session.getExportResult(), exported);
  assert.equal(session.getExportResult().simulation, next);
  session.resetSimulation();
  assert.equal(session.getState().simulation, null);
  assert.equal(session.getState().simulationError, null);
  assert.equal(session.getExportResult(), original);
  assert.equal(session.getState().selectedId, selectedId);
  assert.equal(session.getState().view, 'reference');
});

test('a second simulation removes only its selected relation from original After, never the first removal', () => {
  const session = createSession();
  const after = {
    schemaVersion: 1, people: [{ id: 'p:a', name: 'Alice' }], groups: [],
    resources: [{ id: 'r:a', name: 'Planning' }, { id: 'r:b', name: 'Contracts' }], memberships: [],
    grants: [{ subjectId: 'p:a', resourceId: 'r:a', permission: 'read' }, { subjectId: 'p:a', resourceId: 'r:b', permission: 'read' }],
  };
  const text = JSON.stringify(after);
  session.loadText('before', text);
  session.loadText('after', text);
  session.analyze();
  const [first, second] = session.getState().removableRelations;
  assert.equal(session.simulateRemoval(first.id).changes[0].resource.id, 'r:a');
  const result = session.simulateRemoval(second.id);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].resource.id, 'r:b');
  assert.deepEqual(session.getState().inputs.after.value, after);
});

test('failed simulation clears the previous scenario atomically and leaves the base analysis exportable', () => {
  const session = createSession();
  const original = ready(session);
  session.simulateRemoval(session.getState().removableRelations[0].id);
  assert.ok(session.getExportResult().simulation);
  assert.equal(session.simulateRemoval('unknown'), null);
  assert.equal(session.getState().simulation, null);
  assert.match(session.getState().simulationError, /Simulation impossible/);
  assert.equal(session.getExportResult(), original);
  assert.equal(session.getState().canExport, true);
  assert.ok(session.simulateRemoval(session.getState().removableRelations[0].id));
  assert.equal(session.getState().simulationError, null);
});

test('every asynchronous input replacement clears active simulation and its export before file reading finishes', async t => {
  for (const role of ['before', 'after', 'reference']) {
    await t.test(role, async () => {
      const session = createSession();
      ready(session, true);
      session.simulateRemoval(session.getState().removableRelations[0].id);
      const pending = deferred();
      const task = session.loadFile(role, file('replacement.json', pending));
      assert.equal(session.getState().simulation, null);
      assert.equal(session.getState().simulationError, null);
      assert.deepEqual(session.getState().removableRelations, []);
      assert.equal(session.getExportResult(), null);
      pending.resolve(role === 'reference' ? reference() : snapshot(true));
      await task;
      assert.equal(session.getState().simulation, null);
      assert.equal(session.getExportResult(), null);
    });
  }
});

test('removing a reference, starting an example, and recalculating base analysis all discard simulation and errors', async () => {
  const session = createSession();
  ready(session, true);
  session.simulateRemoval(session.getState().removableRelations[0].id);
  session.removeReference();
  assert.equal(session.getState().simulation, null);
  assert.deepEqual(session.getState().removableRelations, []);
  assert.equal(session.getExportResult(), null);
  session.analyze();
  session.simulateRemoval('unknown');
  assert.ok(session.getState().simulationError);
  session.analyze();
  assert.equal(session.getState().simulationError, null);
  session.simulateRemoval(session.getState().removableRelations[0].id);
  const original = session.analyze();
  assert.equal(session.getState().simulation, null);
  assert.equal(session.getExportResult(), original);
  session.simulateRemoval(session.getState().removableRelations[0].id);
  const pending = deferred();
  const task = session.loadExample(() => pending.promise);
  assert.equal(session.getState().simulation, null);
  assert.equal(session.getState().simulationError, null);
  assert.equal(session.getExportResult(), null);
  assert.deepEqual(session.getState().removableRelations, []);
  pending.resolve(example());
  await task;
  assert.equal(session.getState().simulation, null);
  assert.deepEqual(session.getState().removableRelations, []);
});
