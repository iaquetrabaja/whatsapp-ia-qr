import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { randomBytes,createCipheriv,createDecipheriv,createHmac } from 'node:crypto';
import path from 'node:path';
export async function masterKey(root) {
  await mkdir(root,{recursive:true,mode:0o700});
  const filename=path.join(root,'.masterkey');
  try { const key=await readFile(filename);if(key.length!==32)throw Error('Clave maestra dañada');return key; }
  catch(e){if(e.code!=='ENOENT')throw e;const key=randomBytes(32);try{await writeFile(filename,key,{flag:'wx',mode:0o600});return key;}catch(err){if(err.code==='EEXIST')return masterKey(root);throw err;}}
}
export class Vault {
  constructor(root,key,tenant) {
    this.key=key;this.tenant=String(tenant);this.namespace=createHmac('sha256',key).update('tenant:'+this.tenant).digest('hex');
    this.folder=path.join(root,'tenants',this.namespace);this.pending=Promise.resolve();
  }
  aad(name){return Buffer.from(this.namespace+':'+name);}
  filename(name){if(!/^[a-z0-9-]{1,40}$/.test(name))throw Error('Nombre de archivo no válido');return path.join(this.folder,name+'.enc');}
  async read(name,fallback,reviver) {
    let box;try{box=await readFile(this.filename(name));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}
    if(box.length<28)throw Error('Datos cifrados dañados');
    const decipher=createDecipheriv('aes-256-gcm',this.key,box.subarray(0,12));decipher.setAAD(this.aad(name));decipher.setAuthTag(box.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(box.subarray(28)),decipher.final()]).toString(),reviver);
  }
  save(name,value,replacer) {
    const filename=this.filename(name),payload=JSON.stringify(value,replacer);
    if(Buffer.byteLength(payload)>2*1024*1024)throw Error('Límite de almacenamiento por archivo');
    const operation=this.pending.then(async()=>{await mkdir(this.folder,{recursive:true,mode:0o700});const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(this.aad(name));const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);await writeFile(filename+'.tmp',Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600});await rename(filename+'.tmp',filename);});
    this.pending=operation.catch(()=>{});return operation;
  }
  csrf(){return createHmac('sha256',this.key).update('csrf:'+this.namespace).digest('hex');}
}
