#!/usr/bin/env node
/* Add a small original photograph to the encrypted shared cover bundle.
   Never store original photos, pattern PDFs or passwords in Git. */
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, relative, extname} from 'node:path';
import {createDecipheriv, createCipheriv, pbkdf2Sync, randomBytes} from 'node:crypto';

const id=process.argv[2], file=process.argv[3], password=process.env.SUNBEAM_PASSWORD;
if(!id||!/^[a-z0-9-]{2,80}$/.test(id)||!file||!password){
  console.error('Usage: SUNBEAM_PASSWORD=... node tools/encrypt-cover.mjs GUIDE_ID /outside/repo/photo.webp');
  process.exit(1);
}
const absolute=resolve(file);
const rel=relative(process.cwd(),absolute);
if(rel===''||(!rel.startsWith('..')&&!rel.startsWith('/'))){
  throw Error('Original cover files must be stored outside the public repository');
}
const mime={'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[extname(file).toLowerCase()];
if(!mime)throw Error('Cover must be WebP, PNG or JPEG');
const image=await readFile(absolute);
if(!image.length||image.length>120000)throw Error('Prepare a small <=120 KB cover image before encrypting');
const configText=await readFile('config/auth-config.js','utf8');
const match=configText.match(/window\.SUNBEAM_AUTH_CONFIG\s*=\s*(\{[^;]+\})\s*;/);
if(!match)throw Error('Missing public auth configuration');
const config=JSON.parse(match[1]);
const key=pbkdf2Sync(password,Buffer.from(config.salt,'base64'),config.iterations,32,'sha256');
const wrapped=Buffer.from(config.wrappedKey,'base64');
const unwrap=createDecipheriv('aes-256-gcm',key,Buffer.from(config.iv,'base64'));
unwrap.setAAD(Buffer.from('sunbeam-art-auth-v1'));
unwrap.setAuthTag(wrapped.subarray(wrapped.length-16));
try{Buffer.concat([unwrap.update(wrapped.subarray(0,-16)),unwrap.final()]);}
catch{key.fill(0);throw Error('Incorrect password');}
const plaintext=Buffer.from('data:'+mime+';base64,'+image.toString('base64'));
const iv=randomBytes(12);
const cipher=createCipheriv('aes-256-gcm',key,iv);
cipher.setAAD(Buffer.from('sunbeam-cover:'+id+':v1'));
const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
key.fill(0);
const output=resolve('data/encrypted/cover-previews.json');
const bundle=JSON.parse(await readFile(output,'utf8'));
if(bundle.version!==1||typeof bundle.covers!=='object')throw Error('Unknown cover bundle');
const catalog=JSON.parse(await readFile('data/pattern-catalog.json','utf8'));
if(!catalog.some(entry=>entry.id===id))throw Error('Guide ID is missing from the catalogue');
bundle.covers[id]={iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64')};
await writeFile(output,JSON.stringify(bundle)+'\n','utf8');
console.log('Updated encrypted cover for',id,'(no original photo was copied to Git).');
