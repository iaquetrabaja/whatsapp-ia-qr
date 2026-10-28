import { createHash } from 'node:crypto';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const normalize = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
export const defaults = () => ({ enabled: false, pilot: true, allowedPhones: [], rules: [
  { keyword: 'horario', reply: 'Nuestro horario es de lunes a viernes, de 9:00 a 18:00. Si necesitas hablar con alguien, escribe PERSONA.' },
  { keyword: 'cita', reply: 'Para pedir una cita, dinos qué día prefieres. Una persona de nuestro equipo te confirmará la disponibilidad.' }
] });
export function validateConfig(body) {
  if (typeof body.enabled !== 'boolean' || typeof body.pilot !== 'boolean') throw Error('Configuración incompleta.');
  if (!Array.isArray(body.allowedPhones) || body.allowedPhones.length > 20 || body.allowedPhones.some(p => !/^\d{8,15}$/.test(p))) throw Error('Indica números con prefijo internacional, solo dígitos.');
  if (body.enabled && body.pilot && !body.allowedPhones.length) throw Error('Añade al menos un número de prueba antes de activar.');
  if (!Array.isArray(body.rules) || body.rules.length > 20) throw Error('Máximo 20 reglas.');
  const rules = body.rules.map(r => ({ keyword: String(r.keyword || '').trim(), reply: String(r.reply || '').trim() }));
  if (rules.some(r => r.keyword.length < 2 || r.keyword.length > 60 || !r.reply || r.reply.length > 1500)) throw Error('Cada regla necesita una palabra de 2–60 caracteres y una respuesta de hasta 1.500.');
  if (new Set(rules.map(r => normalize(r.keyword))).size !== rules.length) throw Error('No repitas palabras clave.');
  return { enabled: body.enabled, pilot: body.pilot, allowedPhones: [...new Set(body.allowedPhones)], rules };
}
export class Engine {
  constructor(config, ledger = {}) {
    this.config = config;
    this.ledger = { seen: {}, lastReply: {}, paused: {}, optedOut: {}, sent: [], ...ledger };
  }
  prune(now) {
    for (const [id, ts] of Object.entries(this.ledger.seen)) if (now - ts > 7 * 86400000) delete this.ledger.seen[id];
    const keys = Object.keys(this.ledger.seen);
    for (const id of keys.slice(0, Math.max(0, keys.length - 20000))) delete this.ledger.seen[id];
    this.ledger.sent = this.ledger.sent.filter(t => now - t < 86400000);
    for (const [id,ts] of Object.entries(this.ledger.lastReply)) if (now-ts > 86400000) delete this.ledger.lastReply[id];
    for (const [id,ts] of Object.entries(this.ledger.paused)) if (now >= ts) delete this.ledger.paused[id];
  }
  preview(text) {
    const input = normalize(text);
    if (['baja', 'stop', 'parar'].includes(input)) return { action: 'baja', explanation: 'No se enviarán más respuestas a esta conversación.' };
    if (['persona', 'humano', 'agente'].includes(input)) return { action: 'persona', explanation: 'Automatización pausada en esta conversación durante 24 horas.' };
    const rule = this.config.rules.find(r => input.includes(normalize(r.keyword)));
    return rule ? { action: 'reply', keyword: rule.keyword, text: 'Respuesta automática · ' + rule.reply } : { action: 'omit', explanation: 'No coincide ninguna regla. No se envía nada.' };
  }
  decide(message, now = Date.now()) {
    this.prune(now);
    if (!message.id || !message.chat || message.fromMe || message.history || message.group || message.broadcast || !message.text?.trim()) return { action: 'omit', reason: 'mensaje no elegible' };
    const chat = digest(message.chat), key = digest(message.chat + ':' + message.id);
    if (this.ledger.seen[key]) return { action: 'omit', reason: 'duplicado' };
    this.ledger.seen[key] = now;
    const next = this.preview(message.text);
    if (next.action === 'baja') { this.ledger.optedOut[chat] = true; return next; }
    if (next.action === 'persona') { this.ledger.paused[chat] = now + 86400000; return next; }
    if (this.ledger.optedOut[chat] || this.ledger.paused[chat] > now) return { action: 'omit', reason: 'pausado o baja' };
    if (!this.config.enabled) return { action: 'omit', reason: 'automatización apagada' };
    if (this.config.pilot && !this.config.allowedPhones.includes(message.phone)) return { action: 'omit', reason: 'fuera de números de prueba' };
    if (now - (this.ledger.lastReply[chat] || 0) < 300000) return { action: 'omit', reason: 'espera de 5 minutos en este chat' };
    if (this.ledger.sent.length >= 200 || this.ledger.sent.filter(t => now - t < 3600000).length >= 20) return { action: 'omit', reason: 'límite de respuestas alcanzado' };
    return next;
  }
  recordSent(chat, now = Date.now()) { this.ledger.lastReply[digest(chat)] = now; this.ledger.sent.push(now); }
}
