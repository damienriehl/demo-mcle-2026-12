import { hasKey } from '../server/ai';

// Live check that the configured key and model answer. The real call lands with the intake AI service.
if (!hasKey()) {
  console.log('smoke:ai skipped: no key');
  process.exit(0);
}
console.log('smoke:ai: key found; the live model check is not implemented yet');
