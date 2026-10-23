#!/usr/bin/env node
/*
 * Local-only pattern encryption utility. Never commit source pattern files,
 * password values, or derived keys to a public repository.
 *
 * Usage: SUNBEAM_PASSWORD='YOUR_PASSWORD' node tools/encrypt-pattern.mjs /path/guide.json guide-slug
 * SUNBEAM_REVISION=3 can be used for upgrades (defaults to 2).
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

const input = process.argv[2];
const slug = process.argv[3];
const password = process.env.SUNBEAM_PASSWORD;
const revision = Number(process.env.SUNBEAM_REVISION || 2);
if (!input || !slug || !/^[a-z0-9-]{2,80}$/.test(slug) || !password ||
    !Number.isSafeInteger(revision) || revision < 1) {
  console.error('Usage: SUNBEAM_PASSWORD=... node tools/encrypt-pattern.mjs /path/guide.json pattern-slug');
  process.exit(1);
}
const confSource = await readFile(resolve('config/auth-config.js'), 'utf8');
const found = confSource.match(/window\.SUNBEAM_AUTH_CONFIG\s*=\s*(\{[^;]+\})\s*;/);
if (!found) throw Error('Missing auth configuration');
const config = JSON.parse(found[1]);
const source = await readFile(resolve(input), 'utf8');
let parsed;
if (input.toLowerCase().endsWith('.js')) {
  const match = source.match(/^\s*window\.KIMSI_PRELOADED_GUIDES\s*=\s*([\s\S]*?)\s*;\s*$/);
  if (!match) throw Error('Unsupported JavaScript guide format');
  parsed = JSON.parse(match[1]);
} else {
  parsed = JSON.parse(source);
}
const guides = Array.isArray(parsed) ? parsed : [parsed];
if (guides.length !== 1 || typeof guides[0]?.id !== 'string' ||
    typeof guides[0]?.title !== 'string' ||
    !Array.isArray(guides[0]?.groups) ||
    !guides[0].groups.every(g => Array.isArray(g.steps))) {
  throw Error('Expected a single guide with id, title, and groups[].steps');
}
const guide = { ...guides[0], revision };
const raw = Buffer.from(JSON.stringify(guide), 'utf8');
const key = pbkdf2Sync(password, Buffer.from(config.salt, 'base64'),
  config.iterations, 32, 'sha256');
const iv = randomBytes(12);
const aad = 'sunbeam-art-' + slug + '-v1';
const cipher = createCipheriv('aes-256-gcm', key, iv);
cipher.setAAD(Buffer.from(aad, 'utf8'));
const encrypted = Buffer.concat([cipher.update(raw), cipher.final(), cipher.getAuthTag()]);
const base64 = encrypted.toString('base64');
const outDir = resolve('data/encrypted', slug);
await mkdir(outDir, { recursive: true });
const chunks = base64.match(/.{1,228000}/g) || [];
const variable = 'SUNBEAM_' + slug.toUpperCase().replace(/-/g, '_') + '_PARTS';
for (let i = 0; i < chunks.length; i++) {
  const index = String(i + 1).padStart(2, '0');
  const code = i === 0
    ? 'window.' + variable + '=["' + chunks[i] + '"];\n'
    : 'window.' + variable + '.push("' + chunks[i] + '");\n';
  await writeFile(join(outDir, 'part-' + index + '.js'), code, { flag: 'wx' });
}
const loader = [
  '/* Encrypted private guide: contains no readable purchased pattern content. */',
  'window.SUNBEAM_ENCRYPTED_GUIDES = window.SUNBEAM_ENCRYPTED_GUIDES || [];',
  'window.SUNBEAM_ENCRYPTED_GUIDES.push(' + JSON.stringify({
    id: guide.id, title: guide.title, designer: guide.designer || '',
    revision, format: 'aes-256-gcm', keySource: 'login', aad,
    iv: iv.toString('base64')
  }).slice(0, -1) + ',"ciphertext":window.' + variable + '.join("")});',
  'delete window.' + variable + ';',
  ''
].join('\n');
await writeFile(join(outDir, 'loader.js'), loader, { flag: 'wx' });
key.fill(0);
console.log('Encrypted guide:', guide.id, '(revision ' + revision + ')');
console.log('Wrote', chunks.length, 'ciphertext parts to', outDir);
console.log('Add the part scripts IN ORDER, followed by loader.js, to index.html and service-worker.js.');
console.log('Never commit the original source pattern or a password.');
