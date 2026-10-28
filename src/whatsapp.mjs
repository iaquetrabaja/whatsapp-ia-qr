import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
export class WhatsApp {
  constructor({ folder, vault, onStatus, onMessage, onFlush }) { Object.assign(this, { folder, vault, onStatus, onMessage, onFlush }); this.generation = 0; this.socket = null; this.stopped = true; }
  async connect() {
    if (!this.stopped) return;
    this.stopped = false;
    const generation = ++this.generation;
    const liveAfter = Math.floor(Date.now() / 1000);
    try {
      const { default: makeSocket, useMultiFileAuthState, initAuthCreds, BufferJSON, proto, DisconnectReason, Browsers, getContentType, normalizeMessageContent } = await import('@whiskeysockets/baileys');
      const { default: QRCode } = await import('qrcode');
      const { default: pino } = await import('pino');
      let state,saveCreds;
      if(this.vault) {
        const saved=await this.vault.read('whatsapp-auth',null,BufferJSON.reviver)||{creds:initAuthCreds(),keys:{}};
        const save=()=>this.vault.save('whatsapp-auth',saved,BufferJSON.replacer);
        state={creds:saved.creds,keys:{get:async(type,ids)=>Object.fromEntries(ids.filter(id=>saved.keys[type]?.[id]!=null).map(id=>[id,type==='app-state-sync-key'?proto.Message.AppStateSyncKeyData.fromObject(saved.keys[type][id]):saved.keys[type][id]])),set:async data=>{for(const [type,entries]of Object.entries(data)){saved.keys[type]??={};for(const[id,value]of Object.entries(entries)){if(value==null)delete saved.keys[type][id];else saved.keys[type][id]=value;}}await save();}}};
        saveCreds=save;
      } else {
        const auth = path.join(this.folder, 'auth');
        await mkdir(auth, { recursive: true, mode: 0o700 });
        ({ state, saveCreds } = await useMultiFileAuthState(auth));
      }
      const start = () => {
        if (this.stopped || this.generation !== generation) return;
        this.onStatus({ connection: 'connecting', qr: null });
        const sock = makeSocket({ auth: state, browser: Browsers.ubuntu('IA que trabaja'), logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false });
        this.socket = sock;
        sock.ev.on('creds.update', () => saveCreds().catch(() => this.onStatus({ error: 'No se pudo guardar la sesión. Comprueba permisos y disco.' })));
        sock.ev.on('connection.update', async update => {
          if (this.generation !== generation || this.stopped) return;
          if (update.qr) this.onStatus({ connection: 'qr', qr: await QRCode.toDataURL(update.qr, { width: 280, margin: 2 }) });
          if (update.connection === 'open') this.onStatus({ connection: 'open', qr: null, error: null });
          if (update.connection === 'close') {
            const code = update.lastDisconnect?.error?.output?.statusCode;
            this.onStatus({ connection: code === DisconnectReason.loggedOut ? 'logged_out' : 'closed', qr: null });
            if (code === DisconnectReason.restartRequired && this.restarts !== generation) { this.restarts = generation; setTimeout(start, 1500); }
            else { this.stopped = true; this.onStatus({ error: 'Conexión cerrada. Revisa el móvil y pulsa Conectar; no se reintentan envíos.' }); }
          }
        });
        sock.ev.on('messages.upsert', ({ type, messages }) => {
          if (type !== 'notify' || this.stopped || this.generation !== generation) return;
          for (const message of messages) {
            const chat = message.key.remoteJid || '';
            const content = normalizeMessageContent(message.message) || {};
            const kind = getContentType(content);
            const text = kind === 'conversation' ? content.conversation : kind === 'extendedTextMessage' ? content.extendedTextMessage?.text : '';
            const phoneJid = message.key.remoteJidAlt || chat;
            const phone = phoneJid.endsWith('@s.whatsapp.net') ? phoneJid.split('@')[0].split(':')[0] : null;
            this.onMessage({ id: message.key.id, chat, phone, text, history: Number(message.messageTimestamp || 0) < liveAfter, fromMe: message.key.fromMe, group: !chat.endsWith('@s.whatsapp.net') && !chat.endsWith('@lid'), broadcast: chat.includes('broadcast') || chat.includes('newsletter') }).catch(() => this.onStatus({ error: 'No se pudo procesar un mensaje. No se reintentará automáticamente.' }));
          }
        });
      };
      start();
    } catch { this.stopped = true; this.onStatus({ connection: 'error', qr: null, error: 'No se pudo iniciar Baileys. Comprueba Node 22+, ejecuta npm ci y revisa README.' }); }
  }
  async send(chat, text) { if (this.stopped || !this.socket) throw Error('Sin conexión'); await this.socket.sendMessage(chat, { text }); }
  async disconnect() {
    this.stopped = true; ++this.generation;
    try { if (this.socket) await this.socket.logout(); } catch { /* Local session is removed even if offline. */ }
    this.socket?.end(new Error('Desconexión solicitada')); this.socket = null;
    if(this.vault) await this.vault.save('whatsapp-auth',null);
    else await rm(path.join(this.folder, 'auth'), { recursive: true, force: true });
    this.onStatus({ connection: 'disconnected', qr: null, error: null });
  }
  stop() { this.stopped = true; ++this.generation; this.socket?.end(new Error('Aplicación detenida')); }
}
