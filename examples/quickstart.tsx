import { DiffViewer } from 'm2diff-viewer';
import 'm2diff-viewer/styles.css';

const oldCode = `function total(items) {
  return items.reduce((sum, i) => sum + i.price, 0);
}
`;
const newCode = `function total(items, tax = 0) {
  const net = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return net * (1 + tax);
}
`;

export default function Example() {
  return (
    <DiffViewer
      original={oldCode}
      modified={newCode}
      originalName="cart.js"
      modifiedName="cart.js"
      defaultView="split"
      theme="light"
      collapseUnchanged
      contextLines={3}
    />
  );
}
