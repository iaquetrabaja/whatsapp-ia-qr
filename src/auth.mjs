import { randomBytes,scryptSync,timingSafeEqual,createHash } from 'node:crypto';
export const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
export class Auth {
  constructor({mode,password,origin,basePath,cuentas='http://redes-cuentas:8000/cuenta/auth',fetcher=fetch}) {
    Object.assign(this,{mode,origin,basePath,cuentas,fetcher});this.sessions=new Map();this.attempts=new Map();
    if(!['standalone','tools'].includes(mode))throw Error('Modo de autenticación no válido');
    if(mode==='standalone'){
      if(!password||password.length<16)throw Error('Define IQT_PASSWORD con al menos 16 caracteres.');
      this.salt=randomBytes(16);this.password=scryptSync(password,this.salt,32);
    }
  }
  cookie(req){return (req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('iqt_wa='))?.slice(7);}
  login(req,password) {
    const ip=req.socket.remoteAddress||'local',now=Date.now();
    const recent=(this.attempts.get(ip)||[]).filter(t=>now-t<15*60000);
    if(recent.length>=5)throw Error('Demasiados intentos. Espera 15 minutos.');
    recent.push(now);this.attempts.set(ip,recent);
    while(this.attempts.size>1000)this.attempts.delete(this.attempts.keys().next().value);
    const check=scryptSync(String(password||'').slice(0,500),this.salt,32);
    if(!timingSafeEqual(check,this.password))throw Error('Contraseña incorrecta.');
    this.attempts.delete(ip);const token=randomBytes(32).toString('hex');this.sessions.set(token,{expires:now+12*3600000});
    for(const[k,v]of this.sessions)if(v.expires<now)this.sessions.delete(k);
    while(this.sessions.size>50)this.sessions.delete(this.sessions.keys().next().value);
    return `iqt_wa=${token}; HttpOnly; SameSite=Strict; Path=${this.basePath}; Max-Age=43200${this.origin.startsWith('https:')?'; Secure':''}`;
  }
  async identify(req) {
    if(this.mode==='standalone'){const session=this.sessions.get(this.cookie(req));return session?.expires>Date.now()?'owner':null;}
    if(!(req.headers.cookie||'').length)return null;
    try {const r=await this.fetcher(this.cuentas,{headers:{Cookie:req.headers.cookie},redirect:'error',signal:AbortSignal.timeout(5000)});const id=r.headers.get('x-user-id'),email=r.headers.get('x-user-email')?.trim().toLowerCase();return r.status===200&&/^\d{1,15}$/.test(id||'')&&email?.includes('@')?'tools-'+id+'-'+createHash('sha256').update(email).digest('hex'):null;}catch{return null;}
  }
  logout(req){if(this.mode==='standalone')this.sessions.delete(this.cookie(req));return `iqt_wa=; HttpOnly; SameSite=Strict; Path=${this.basePath}; Max-Age=0${this.origin.startsWith('https:')?'; Secure':''}`;}
}
