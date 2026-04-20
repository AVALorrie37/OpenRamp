'use strict';

const fs = require('fs');
const path = require('path');

const url = process.env.OPENRAMP_DEV_URL || 'http://localhost:5173/';
const B = '\x1b[1m';
const G = '\x1b[32m';
const C = '\x1b[36m';
const M = '\x1b[35m';
const R = '\x1b[0m';

const artPath = path.join(__dirname, 'openramp-banner-ascii.txt');
const art = fs.readFileSync(artPath, 'utf8').trimEnd().split(/\r?\n/);
const colored = art.map((line) => `${G}${B}${line}${R}`);

const lines = ['', ...colored, '', `${M}${B}  ▶ Dev UI${R}  ${C}${B}${url}${R}`, ''];

console.log(lines.join('\n'));
