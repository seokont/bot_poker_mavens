import { runAll } from './poker-engine.spec';

const failed = runAll();

process.exit(failed > 0 ? 1 : 0);
