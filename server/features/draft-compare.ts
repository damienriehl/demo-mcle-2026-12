import { createDraftCompareRoutes } from '../drafts/routes';
import { ensureEngine } from '../drafts/engine';
import { warmFolioIndex } from '../folio/index';

void Promise.resolve().then(warmFolioIndex).catch(() => {});
void Promise.resolve().then(ensureEngine).catch(() => {});

export default createDraftCompareRoutes();
