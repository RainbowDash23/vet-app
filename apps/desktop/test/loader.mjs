import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./loader-hooks.mjs', pathToFileURL(import.meta.filename ?? './test/loader.mjs').href);
