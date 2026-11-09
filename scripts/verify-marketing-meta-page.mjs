import { pathToFileURL } from 'node:url';
import { verifyMetaPage } from '../lib/marketing/meta-page.mjs';

export { verifyMetaPage };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await verifyMetaPage()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
