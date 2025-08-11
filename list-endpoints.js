import * as app from './index.js';
import listEndpoints from 'express-list-endpoints';

console.table(listEndpoints(app));