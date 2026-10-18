// The engine has no React or DOM dependency: use it in Node, CLIs, servers and workers.
import { computeDiff, createDiffReport, createUnifiedPatch, diffCsv, diffJson } from 'm2diff-viewer/core';

export const result = computeDiff('a\nb\nc\n', 'a\nB\nc\nd\n', { ignoreWhitespace: 'trim', intraline: 'word' });
export const patch = createUnifiedPatch(result, { oldName: 'a/notes.txt', newName: 'b/notes.txt' });
export const report = createDiffReport(result);

export const json = diffJson('{"retries": 3, "ts": 1}', '{"retries": 5, "ts": 2}', { ignorePaths: ['$.ts'] });
export const changedPaths = json.structure?.changes.map((c) => `${c.kind} ${c.pathString}`) ?? [];

export const csv = diffCsv('id,qty\n1,5\n2,7\n', 'id,qty\n2,8\n1,5\n', { keyColumns: ['id'] });
