#!/usr/bin/env node
// Public-key-only re-encryption: no password or private key on CI runner.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createCipheriv,publicEncrypt,randomBytes,constants} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import sharp from 'sharp';

const HISTORY='6b43e159d36e799db913c80b6014ed1687ff640b:private-guide.js';
const ID='thewhimsywhale-donut-kitty';
const PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8KWvvl6qjcXx4LJu0I0Q\nvR+3QuKRpmRk+A+YAE2RUq5T/czGD8umqbTDNEBaVKHHTebf3yWW2Di5qgw5leVk\nO0KMuTVvFC4Bczuw9O7pi0ItGLA49e7UYRJv8M7yBijuFulRt6R3kC/78tgHvfwg\nj/z2FVU9R5HrFltaVj3U0L5WH0Y/6X7qMrojiYv9MuIWZB/K6FsXc8afOR0GvKCl\n23HnUt2ydTRV+FoahRF2YyymcG73erBAhl/1vb/36Oc7z4d82HrKYc0NpYTasloZ\nXdrdtG4FOdAzEZUybZfMu6GVA+P2iqL2TV6NzIC3j0Yq+cZhVedDyJ72P/vHOXyX\nUwIDAQAB\n-----END PUBLIC KEY-----';
const source=execFileSync('git',['show',HISTORY],{encoding:'utf8',maxBuffer:20*1024*1024});
const match=source.match(/^\s*window\.KIMSI_PRELOADED_GUIDES\s*=\s*([\s\S]*?)\s*;\s*$/);
if(!match)throw Error('Unexpected legacy guide format');
const parsed=JSON.parse(match[1]);
const old=(Array.isArray(parsed)?parsed:[parsed]).find(g=>g.id==='donut-kitty'&&/donut/i.test(g.title||''));
if(!old)throw Error('Donut Kitty not found in prior source');
const images=Object.values(old.images||{}).filter(src=>typeof src==='string'&&/^data:image\/(jpeg|png|webp);base64,/i.test(src));
const steps=old.groups?.reduce((n,g)=>n+(g.steps?.length||0),0)||0;
if(steps<45||images.length<45)throw Error('Guide photos or steps incomplete');
const guide={...old,id:ID,revision:1,title:'Donut Kitty',designer:'The Whimsy Whale'};
const outDir='data/encrypted/donut';
await mkdir(outDir,{recursive:true});
function encrypt(text,aad,gzip=false){
  const input=gzip?gzipSync(Buffer.from(text,'utf8')):Buffer.from(text,'utf8');
  const key=randomBytes(32),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(aad,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(input),cipher.final(),cipher.getAuthTag()]);
  const wrappedSessionKey=publicEncrypt({key:PUBLIC_KEY,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
  key.fill(0);
  return {keySource:'donut-rsa',iv:iv.toString('base64'),wrappedSessionKey:wrappedSessionKey.toString('base64'),ciphertext:ciphertext.toString('base64')};
}
const enc=encrypt(JSON.stringify(guide),'sunbeam-art-donut-kitty-v1',true);
const parts=enc.ciphertext.match(/.{1,200000}/g)||[];
for(let i=0;i<parts.length;i++){
  const filename='part-'+String(i+1).padStart(2,'0')+'.js';
  const line=i===0?'window.SUNBEAM_DONUT_PARTS=["'+parts[i]+'"];\n':'window.SUNBEAM_DONUT_PARTS.push("'+parts[i]+'");\n';
  await writeFile(outDir+'/'+filename,line,{flag:'wx'});
}
const loader={id:ID,title:guide.title,designer:guide.designer,revision:1,format:'gzip+aes-256-gcm+rsa-oaep',
  keySource:'donut-rsa',aad:'sunbeam-art-donut-kitty-v1',iv:enc.iv,wrappedSessionKey:enc.wrappedSessionKey};
await writeFile(outDir+'/loader.js',[
  '/* Encrypted Donut Kitty: no readable purchased instructions or photographs. */',
  'window.SUNBEAM_ENCRYPTED_GUIDES=window.SUNBEAM_ENCRYPTED_GUIDES||[];',
  'window.SUNBEAM_ENCRYPTED_GUIDES.push('+JSON.stringify(loader).slice(0,-1)+',"ciphertext":window.SUNBEAM_DONUT_PARTS.join("")});',
  'delete window.SUNBEAM_DONUT_PARTS;',''
].join('\n'),{flag:'wx'});
const catalogPath='data/pattern-catalog.json';
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
if(catalog.some(x=>x.id===ID))throw Error('Guide already exists');
catalog.push({id:ID,title:guide.title,designer:guide.designer,revision:1,
  assets:[...parts.map((_,i)=>outDir+'/part-'+String(i+1).padStart(2,'0')+'.js'),outDir+'/loader.js']});
await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n','utf8');
const keys=[old.cover,'cover','finished','front','hero',...Object.keys(old.images||{})];
let cover=null;const seen=new Set();
for(const name of keys){
  if(typeof name!=='string'||seen.has(name))continue;
  seen.add(name);
  const src=old.images?.[name];
  if(typeof src==='string'&&/^data:image\/(jpeg|png|webp);base64,/i.test(src)){
    cover=Buffer.from(src.slice(src.indexOf(',')+1),'base64');
    break;
  }
}
if(!cover)throw Error('Missing original cover photograph');
const webp=await sharp(cover).rotate().resize(440,440,{fit:'cover',position:'attention'}).webp({quality:78,effort:5}).toBuffer();
const sealedCover=encrypt('data:image/webp;base64,'+webp.toString('base64'),'sunbeam-cover:'+ID+':v1');
const coverPath='data/encrypted/cover-previews.json';
const bundle=JSON.parse(await readFile(coverPath,'utf8'));
if(bundle.version!==1||!bundle.covers||bundle.covers[ID])throw Error('Invalid or already updated cover bundle');
bundle.covers[ID]=sealedCover;
if(Buffer.byteLength(JSON.stringify(bundle))>400000)throw Error('Cover bundle too large');
await writeFile(coverPath,JSON.stringify(bundle)+'\n','utf8');
console.log(JSON.stringify({id:ID,groups:guide.groups.length,steps,photos:images.length,
  encryptedParts:parts.length,coverBytes:webp.length,coverBundleBytes:Buffer.byteLength(JSON.stringify(bundle))}));
