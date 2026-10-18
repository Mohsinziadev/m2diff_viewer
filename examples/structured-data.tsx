import { CsvDiffViewer, JsonDiffViewer } from 'm2diff-viewer';
import 'm2diff-viewer/styles.css';

const before = JSON.stringify({
  id: 7,
  status: 'active',
  users: [{ id: 1, name: 'Ada', lastSeen: '2024-01-01' }],
  metadata: { updatedAt: '2024-01-01' },
});
const after = JSON.stringify({
  id: 7,
  status: 'paused',
  users: [
    { id: 1, name: 'Ada', lastSeen: '2025-03-09' },
    { id: 2, name: 'Linus' },
  ],
  metadata: { updatedAt: '2025-03-09' },
});

export function ApiResponseDiff() {
  return (
    <JsonDiffViewer
      original={before}
      modified={after}
      // Volatile fields are shown but not counted as changes; the input is never modified.
      ignorePaths={['metadata.updatedAt', 'users[*].lastSeen']}
      arrayKeys={{ users: 'id' }}
      height={420}
    />
  );
}

export function PriceListDiff() {
  return (
    <CsvDiffViewer
      original={'sku,name,price\nA1,"Widget, small",1.00\nB2,Gadget,4.50\n'}
      modified={'sku,name,price\nB2,Gadget,4.75\nA1,"Widget, small",1.00\nC3,Gizmo,9.99\n'}
      keyColumns={['sku']}
      height={300}
    />
  );
}
