import { runAll } from './state-derivation.spec';

const failed = runAll();

process.exit(failed > 0 ? 1 : 0);
