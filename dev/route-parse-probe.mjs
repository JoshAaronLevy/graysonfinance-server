// Validates route strings before Express registers them.
// Logs the offending path, then rethrows the original error.
import express from 'express';
import { parse as ptreParse } from 'path-to-regexp';

// Patch the Express app prototype (top-level app.use/app.get/etc.)
const appProto = express.application;
const routerFactory = express.Router;

// Wrap a set of HTTP methods on a target (app/router instances)
function wrapMethods(target, label) {
  const methods = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
  for (const m of methods) {
    if (typeof target[m] !== 'function') continue;
    const orig = target[m];
    target[m] = function patchedMethod(...args) {
      const path = typeof args[0] === 'string' ? args[0] : undefined;
      if (path) {
        try {
          // Validate like Express will
          ptreParse(path);
        } catch (e) {
          // High-signal log right before the crash
          console.error('\n🚨 BAD ROUTE PATTERN DETECTED (' + label + '.' + m + '):\n', path, '\n');
          throw e;
        }
      }
      return orig.apply(this, args);
    };
  }
}

// Patch app prototype so every app instance validates paths
wrapMethods(appProto, 'app');

// Patch the Router() factory so every router instance validates too
express.Router = function patchedRouter(...rfArgs) {
  const router = routerFactory.apply(this, rfArgs);
  wrapMethods(router, 'router');
  return router;
};
