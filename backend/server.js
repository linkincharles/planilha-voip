const express        = require('express');
const cors           = require('cors');
const mysql          = require('mysql2/promise');
const bcrypt         = require('bcryptjs');
const session        = require('express-session');
const jwt            = require('jsonwebtoken');
const JWT_SECRET     = process.env.JWT_SECRET || 'telecrm_jwt_2024_secret';
const multer         = require('multer');
const ExcelJS        = require('exceljs');
const { parse }      = require('csv-parse/sync');
const { stringify }  = require('csv-stringify/sync');
const fs             = require('fs');
const path           = require('path');
const zlib           = require('zlib');

// Cache de estatísticas ( TTL 30 segundos )
let statsCache = { data: null, timestamp: 0 };
const STATS_TTL = 30 * 1000;

// Criar índice automaticamente ao iniciar
(async () => {
  try {
    await pool.query('CREATE INDEX IF NOT EXISTS idx_numeros_data_ativacao ON numeros(data_ativacao)');
    console.log('✅ Índice data_ativacao criado');
  } catch(e) { console.log('ℹ️ Índice pode já existir:', e.message); }
})();

const getStats = async () => {
  const now = Date.now();
  if (statsCache.data && (now - statsCache.timestamp) < STATS_TTL) {
    return statsCache.data;
  }
  const [[stats]] = await pool.query(`SELECT COUNT(*) AS total,SUM(status='Ativo') AS ativos,SUM(status='Inativo') AS inativos,SUM(status='Pendente') AS pendentes FROM numeros`);
  statsCache = { data: stats, timestamp: now };
  return stats;
};

const clearStatsCache = () => { statsCache = { data: null, timestamp: 0 }; };

const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'telecrm.sid',
  secret: 'telecrm_secret_2024',
  resave: true,
  saveUninitialized: false,
  cookie: {
    maxAge: 28800000,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
    // sem domain — funciona em qualquer IP
  }
}));

// Upload: imagens em disco para logo
const uploadDir = '/app/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const docsDir = '/app/docs';
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
// fallback tmp
['/tmp/telecrm_uploads','/tmp/telecrm_docs'].forEach(d=>{try{if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});}catch(e){}});
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Docs salvos no banco — multer em memória
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Serve logo
app.use('/api/logo', express.static(uploadDir));

// ── Pool ─────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               process.env.DB_PORT || 3306,
  database:           process.env.DB_NAME || 'telecrm',
  user:               process.env.DB_USER || 'telecrm',
  password:           process.env.DB_PASS || 'telecrm_pass',
  waitForConnections: true,
  connectionLimit:    10,
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function getTokenUser(req) {
  // Tenta JWT no header Authorization
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    try {
      return jwt.verify(auth.slice(7), JWT_SECRET);
    } catch(e) { return null; }
  }
  // Fallback: sessão
  if (req.session && req.session.userId) {
    return { userId: req.session.userId, username: req.session.username, nome: req.session.nome, role: req.session.role, permissoes: req.session.permissoes || [] };
  }
  return null;
}

function requireAuth(req, res, next) {
  const user = getTokenUser(req);
  if (user) { req.user = user; return next(); }
  res.status(401).json({ error: 'Não autenticado' });
}

// Permissões disponíveis
const PERMISSOES_DISPONIVEIS = [
  'ver_numeros', 'criar_numero', 'editar_numero', 'remover_numero',
  'importar', 'exportar', 'ver_historico', 'ver_usuarios',
  'gerenciar_operadoras', 'configuracoes_sistema',
  'ver_portabilidade', 'criar_portabilidade', 'editar_portabilidade', 'remover_portabilidade'
];

// Admin tem tudo; operador tem só o que foi liberado
function temPermissao(req, perm) {
  const user = req.user || getTokenUser(req);
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.permissoes || []).includes(perm);
}

function requirePermissao(perm) {
  return (req, res, next) => {
    const user = getTokenUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado' });
    req.user = user;
    if (!temPermissao(req, perm)) return res.status(403).json({ error: 'Sem permissão para esta ação' });
    next();
  };
}

// ── Log + Webhook ─────────────────────────────────────────────────────────────
async function getWebhookUrl() {
  try {
    const [[row]] = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'webhook_url'");
    return row?.valor || null;
  } catch(e) { return null; }
}

async function dispararWebhook(payload) {
  const url = await getWebhookUrl();
  if (!url || !url.startsWith('http')) return;
  try {
    const https = url.startsWith('https') ? require('https') : require('http');
    const body  = JSON.stringify(payload);
    const u     = new URL(url);
    const opts  = {
      hostname: u.hostname, port: u.port || (url.startsWith('https') ? 443 : 80),
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'TeleCRM-Webhook/2.0' }
    };
    await new Promise((resolve) => {
      const req = https.request(opts, (res) => {
        console.log(`📡 Webhook enviado → ${url} [${res.statusCode}]`);
        resolve();
      });
      req.on('error', (e) => { console.warn('⚠️  Webhook erro:', e.message); resolve(); });
      req.setTimeout(5000, () => { req.destroy(); console.warn('⚠️  Webhook timeout'); resolve(); });
      req.write(body);
      req.end();
    });
  } catch(e) { console.warn('⚠️  Webhook falhou:', e.message); }
}

async function logAction(userId, acao, entidade, entidadeId, detalhes = null, req = null) {
  const ip = req ? (req.ip || req.connection.remoteAddress || 'unknown') : null;
  const detalhesComIp = ip ? { ...detalhes, ip } : detalhes;
  try {
    await pool.query(
      'INSERT INTO historico (usuario_id, acao, entidade, entidade_id, detalhes) VALUES (?,?,?,?,?)',
      [userId, acao, entidade, entidadeId, detalhesComIp ? JSON.stringify(detalhesComIp) : null]
    );
  } catch(e) { console.error('Log error:', e.message); }

  // Dispara webhook em background (não bloqueia a resposta)
  try {
    let usuario = null;
    if (userId) {
      const [[u]] = await pool.query('SELECT username, nome FROM usuarios WHERE id = ?', [userId]);
      usuario = u || null;
    }
    dispararWebhook({
      evento:     acao,
      entidade,
      entidade_id: entidadeId,
      detalhes,
      usuario:    usuario ? { id: userId, username: usuario.username, nome: usuario.nome } : null,
      timestamp:  new Date().toISOString(),
      sistema:    'TeleCRM'
    }).catch(() => {});
  } catch(e) {}
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES DO SISTEMA
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT chave, valor FROM configuracoes');
    const cfg = {};
    rows.forEach(r => cfg[r.chave] = r.valor);
    res.json(cfg);
  } catch(e) {
    res.json({ app_nome: 'TeleCRM', app_subtitulo: 'Gestão de Números de Telefonia', app_logo: '' });
  }
});

app.put('/api/config', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  const allowedKeys = ['app_nome', 'app_subtitulo', 'api_consulta_operadora_url', 'api_consulta_operadora_login', 'api_consulta_operadora_senha'];
  for (const [k, v] of Object.entries(req.body)) {
    if (allowedKeys.includes(k)) {
      await pool.query(
        'INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=?',
        [k, v || '', v || '']
      );
    }
  }
  await logAction((req.user||{}).userId || req.session.userId, 'CONFIG', 'sistema', null, req.body);
  res.json({ ok: true });
});

app.post('/api/config/logo', requireAuth, upload.single('logo'), async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const url = '/api/logo/' + req.file.filename + '?t=' + Date.now();
  await pool.query(
    'INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=?',
    ['app_logo', url, url]
  );
  res.json({ ok: true, url });
});

// ── Webhook config ───────────────────────────────────────────────────────────
app.get('/api/config/webhook', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  try {
    const [[row]] = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'webhook_url'");
    res.json({ webhook_url: row?.valor || '' });
  } catch(e) { res.json({ webhook_url: '' }); }
});

app.put('/api/config/webhook', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  const { webhook_url } = req.body;
  await pool.query(
    "INSERT INTO configuracoes (chave, valor) VALUES ('webhook_url',?) ON DUPLICATE KEY UPDATE valor=?",
    [webhook_url || '', webhook_url || '']
  );
  await logAction((req.user||{}).userId || req.session.userId, 'CONFIG_WEBHOOK', 'sistema', null, { webhook_url: webhook_url ? '***' : '(removido)' });
  res.json({ ok: true });
});

app.post('/api/config/webhook/test', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  const { webhook_url } = req.body;
  if (!webhook_url) return res.status(400).json({ error: 'URL não informada' });
  try {
    const https = webhook_url.startsWith('https') ? require('https') : require('http');
    const body  = JSON.stringify({
      evento: 'TESTE', entidade: 'sistema', entidade_id: null,
      detalhes: { mensagem: 'Teste de webhook do TeleCRM' },
      usuario: { id: req.session.userId, username: req.session.username, nome: req.session.nome },
      timestamp: new Date().toISOString(), sistema: 'TeleCRM'
    });
    const u    = new URL(webhook_url);
    const opts = {
      hostname: u.hostname, port: u.port || (webhook_url.startsWith('https') ? 443 : 80),
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'TeleCRM-Webhook/2.0' }
    };
    const status = await new Promise((resolve, reject) => {
      const req2 = https.request(opts, (r) => resolve(r.statusCode));
      req2.on('error', reject);
      req2.setTimeout(5000, () => { req2.destroy(); reject(new Error('Timeout')); });
      req2.write(body); req2.end();
    });
    res.json({ ok: true, status });
  } catch(e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.delete('/api/config/logo', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  await pool.query("DELETE FROM configuracoes WHERE chave = 'app_logo'");
  // Remove arquivo físico
  ['png','jpg','jpeg','gif','webp','svg'].forEach(ext => {
    const f = path.join(uploadDir, 'logo.' + ext);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

// Rate limiting simple
const loginAttempts = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX = 5;

const checkRateLimit = (ip) => {
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > loginAttempts[ip].resetAt) { loginAttempts[ip] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }; }
  loginAttempts[ip].count++;
  return loginAttempts[ip].count > RATE_LIMIT_MAX;
};

app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (checkRateLimit(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
  
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  try {
    const [[user]] = await pool.query('SELECT * FROM usuarios WHERE username = ? AND ativo = 1', [username]);
    if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    const ok = await bcrypt.compare(password, user.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    const permissoes = user.role === 'admin'
      ? PERMISSOES_DISPONIVEIS
      : (user.permissoes ? (typeof user.permissoes === 'string' ? JSON.parse(user.permissoes) : user.permissoes) : []);
    req.session.userId     = user.id;
    req.session.username   = user.username;
    req.session.nome       = user.nome;
    req.session.role       = user.role;
    req.session.permissoes = permissoes;
    await pool.query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [user.id]);
    // Forçar gravação da sessão antes de responder
    // Gerar JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, nome: user.nome, role: user.role, permissoes },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    // Salvar na sessão também (fallback)
    req.session.userId     = user.id;
    req.session.username   = user.username;
    req.session.nome       = user.nome;
    req.session.role       = user.role;
    req.session.permissoes = permissoes;
    req.session.save(() => {});
    console.log('✅ Login OK:', user.username, '| role:', user.role);
    res.json({ ok: true, token, user: { id: user.id, username: user.username, nome: user.nome, role: user.role, permissoes } });
  } catch(e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Rota debug — remover após resolver
app.get('/api/debug/session', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    userId: req.session.userId || null,
    role: req.session.role || null,
    session: req.session,
    cookies: req.headers.cookie || 'nenhum cookie',
    headers: {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer
    }
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = getTokenUser(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });
  res.json({ id: user.userId, username: user.username, nome: user.nome, role: user.role, permissoes: user.permissoes || [] });
});

// ── Usuários ──────────────────────────────────────────────────────────────────
app.get('/api/usuarios', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  const [rows] = await pool.query('SELECT id, username, nome, role, permissoes, ativo, criado_em, ultimo_acesso FROM usuarios ORDER BY nome');
  res.json(rows);
});

app.post('/api/usuarios', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  const { username, nome, password, role = 'operador' } = req.body;
  if (!username || !nome || !password) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  const hash = await bcrypt.hash(password, 10);
  const perms = role === 'admin' ? null : JSON.stringify(req.body.permissoes || []);
  try {
    const [r] = await pool.query('INSERT INTO usuarios (username, nome, senha_hash, role, permissoes) VALUES (?,?,?,?,?)', [username, nome, hash, role, perms]);
    await logAction((req.user||{}).userId || req.session.userId, 'CRIAR_USUARIO', 'usuario', r.insertId, { username, nome, role, permissoes: req.body.permissoes });
    res.json({ ok: true, id: r.insertId });
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username já existe' });
    throw e;
  }
});

app.put('/api/usuarios/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  const { nome, role, ativo, password } = req.body;
  const perms = role === 'admin' ? null : JSON.stringify(req.body.permissoes || []);
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE usuarios SET nome=?, role=?, ativo=?, senha_hash=?, permissoes=? WHERE id=?', [nome, role, ativo, hash, perms, req.params.id]);
  } else {
    await pool.query('UPDATE usuarios SET nome=?, role=?, ativo=?, permissoes=? WHERE id=?', [nome, role, ativo, perms, req.params.id]);
  }
  await logAction((req.user||{}).userId || req.session.userId, 'EDITAR_USUARIO', 'usuario', req.params.id, { nome, role, ativo, permissoes: req.body.permissoes });
  res.json({ ok: true });
});

app.delete('/api/usuarios/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  if (Number(req.params.id) === req.session.userId) return res.status(400).json({ error: 'Não pode remover a si mesmo' });
  await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// OPERADORAS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/operadoras', requireAuth, async (req, res) => {
  const [rows] = await pool.query('SELECT nome FROM operadoras ORDER BY nome');
  res.json(rows.map(r => r.nome));
});

app.post('/api/operadoras', requirePermissao('gerenciar_operadoras'), async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    await pool.query('INSERT INTO operadoras (nome) VALUES (?)', [nome.toUpperCase()]);
    await logAction((req.user||{}).userId || req.session.userId, 'CRIAR_OPERADORA', 'operadora', null, { nome });
    res.json({ ok: true });
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Operadora já existe' });
    throw e;
  }
});

app.delete('/api/operadoras/:nome', requirePermissao('gerenciar_operadoras'), async (req, res) => {
  await pool.query('DELETE FROM operadoras WHERE nome = ?', [req.params.nome]);
  await logAction((req.user||{}).userId || req.session.userId, 'REMOVER_OPERADORA', 'operadora', null, { nome: req.params.nome });
  res.json({ ok: true });
});

// Consultar operador por número
app.get('/api/consulta-operadora', requireAuth, async (req, res) => {
  const { numero } = req.query;
  if (!numero) return res.status(400).json({ error: 'Número é obrigatório' });
  
  try {
    // Busca config da API
    const [[config]] = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'api_consulta_operadora_url'");
    const apiUrl = config?.valor || '';
    
    if (!apiUrl || apiUrl.trim() === '') {
      return res.status(503).json({ error: 'API de consulta não configurada. Configure em Configurações.' });
    }
    
    const [[loginCfg]] = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'api_consulta_operadora_login'");
    const [[senhaCfg]] = await pool.query("SELECT valor FROM configuracoes WHERE chave = 'api_consulta_operadora_senha'");
    
    const login = loginCfg?.valor || 'admin';
    const senha = senhaCfg?.valor || '123';
    
    console.log('Consultando operadora:', numero, 'URL:', apiUrl);
    
    const response = await fetch(`${apiUrl}?numero=${encodeURIComponent(numero)}&login=${encodeURIComponent(login)}&senha=${encodeURIComponent(senha)}`);
    const data = await response.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: 'Erro ao consultar operadora: ' + e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// NÚMEROS
// ══════════════════════════════════════════════════════════════════════════════

async function getRecord(id) {
  const [[row]] = await pool.query('SELECT * FROM numeros WHERE id = ?', [id]);
  if (!row) return null;
  const [tels] = await pool.query('SELECT telefone FROM numero_telefones WHERE numero_id = ? ORDER BY id', [id]);
  row.numeros = tels.map(t => t.telefone);
  return row;
}

// Dashboard stats
app.get('/api/dashboard', requirePermissao('ver_numeros'), async (req, res) => {
  try {
    const [[stats]] = await pool.query(`SELECT COUNT(*) AS total,SUM(status='Ativo') AS ativos,SUM(status='Inativo') AS inativos,SUM(status='Pendente') AS pendentes FROM numeros`);
    
    const [porOperadora] = await pool.query(`SELECT operadora, COUNT(*) as total FROM numeros WHERE operadora IS NOT NULL AND operadora != '' GROUP BY operadora ORDER BY total DESC`);
    
    const [porServidor] = await pool.query(`SELECT servidor, COUNT(*) as total FROM numeros WHERE servidor IS NOT NULL AND servidor != '' GROUP BY servidor ORDER BY total DESC LIMIT 10`);
    
    const [[esteMes]] = await pool.query(`SELECT COUNT(*) as total FROM numeros WHERE MONTH(criado_em) = MONTH(CURDATE()) AND YEAR(criado_em) = YEAR(CURDATE())`);
    
    const [[ultimos30]] = await pool.query(`SELECT COUNT(*) as total FROM numeros WHERE criado_em >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`);
    
    const [recentes] = await pool.query(`SELECT id, empresa, status, criado_em FROM numeros ORDER BY criado_em DESC LIMIT 5`);
    
    const [[portaStats]] = await pool.query(`SELECT COUNT(*) as total, SUM(status='Pendente') as pendente, SUM(status='Concluido') as concluido, SUM(status='Cancelado') as cancelado FROM portabilidade`);
    
    res.json({ stats, porOperadora, porServidor, esteMes: esteMes.total, ultimos30: ultimos30.total, recentes, portaStats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/numeros', requirePermissao('ver_numeros'), async (req, res) => {
  const { q = '', status, page = 1, limit = 50, from, to } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  let where = 'WHERE 1=1';
  const params = [];
  if (status && status !== 'todos') { where += ' AND n.status = ?'; params.push(status); }
  if (from) { where += ' AND n.data_ativacao >= ?'; params.push(from); }
  if (to) { where += ' AND n.data_ativacao <= ?'; params.push(to); }
  if (q) {
    where += ` AND (n.empresa LIKE ? OR n.servidor LIKE ? OR n.operadora LIKE ? OR
      EXISTS (SELECT 1 FROM numero_telefones nt WHERE nt.numero_id = n.id AND nt.telefone LIKE ?))`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM numeros n ${where}`, params);
  const sort = req.query.sort || 'id';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  const safeSort = ['id','empresa','operadora','servidor','status','data_ativacao','criado_em'].includes(sort) ? sort : 'id';
  const [rows] = await pool.query(
    `SELECT n.* FROM numeros n ${where} ORDER BY n.${safeSort} ${dir} LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );
  if (rows.length) {
    const ids = rows.map(r => r.id);
    const [tels] = await pool.query(`SELECT numero_id, telefone FROM numero_telefones WHERE numero_id IN (?) ORDER BY id`, [ids]);
    const telMap = {};
    tels.forEach(t => { if (!telMap[t.numero_id]) telMap[t.numero_id] = []; telMap[t.numero_id].push(t.telefone); });
    rows.forEach(r => { r.numeros = telMap[r.id] || []; });
  }
  const stats = await getStats();
  res.json({ data: rows, total: Number(total), stats });
});

app.get('/api/numeros/:id', requirePermissao('ver_numeros'), async (req, res) => {
  const row = await getRecord(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  res.json(row);
});

app.post('/api/numeros', requirePermissao('criar_numero'), async (req, res) => {
  const { empresa, operadora, servidor, status, contrato, obs, data_ativacao, numeros = [] } = req.body;
  if (!empresa) return res.status(400).json({ error: 'Empresa obrigatória' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO numeros (empresa, operadora, servidor, status, contrato, obs, data_ativacao) VALUES (?,?,?,?,?,?,?)`,
      [empresa, operadora||null, servidor||null, status||'Ativo', contrato||null, obs||null, data_ativacao||null]
    );
    const id = result.insertId;
    if (numeros.length) await conn.query('INSERT INTO numero_telefones (numero_id, telefone) VALUES ?', [numeros.map(n=>[id,n])]);
    await conn.commit();
    const rec = await getRecord(id);
    clearStatsCache();
    await logAction((req.user||{}).userId || req.session.userId, 'CRIAR', 'numero', id, { empresa, status, operadora, servidor, numeros, contrato: contrato||null, obs: obs||null });
    res.json(rec);
  } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

app.put('/api/numeros/:id', requirePermissao('editar_numero'), async (req, res) => {
  const { empresa, operadora, servidor, status, contrato, obs, data_ativacao, numeros = [] } = req.body;
  const { id } = req.params;
  const antes = await getRecord(id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE numeros SET empresa=?,operadora=?,servidor=?,status=?,contrato=?,obs=?,data_ativacao=? WHERE id=?`,
      [empresa, operadora||null, servidor||null, status, contrato||null, obs||null, data_ativacao||null, id]
    );
    await conn.query('DELETE FROM numero_telefones WHERE numero_id = ?', [id]);
    if (numeros.length) await conn.query('INSERT INTO numero_telefones (numero_id, telefone) VALUES ?', [numeros.map(n=>[id,n])]);
    await conn.commit();
    const rec = await getRecord(id);
    clearStatsCache();
    await logAction((req.user||{}).userId || req.session.userId, 'EDITAR', 'numero', id, { antes: { empresa: antes?.empresa, status: antes?.status, numeros: antes?.numeros, contrato: antes?.contrato, obs: antes?.obs }, depois: { empresa, status, numeros, servidor, contrato: contrato||null, obs: obs||null } });
    res.json(rec);
  } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
});

app.delete('/api/numeros/:id', requirePermissao('remover_numero'), async (req, res) => {
  const rec = await getRecord(req.params.id);
  await pool.query('DELETE FROM numeros WHERE id = ?', [req.params.id]);
  clearStatsCache();
  await logAction((req.user||{}).userId || req.session.userId, 'REMOVER', 'numero', req.params.id, {
    empresa: rec?.empresa, numeros: rec?.numeros, servidor: rec?.servidor,
    operadora: rec?.operadora, status: rec?.status
  });
  res.json({ ok: true });
});

app.delete('/api/numeros', requirePermissao('remover_numero'), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'IDs obrigatórios' });
  // Busca dados completos antes de deletar
  const registros = await Promise.all(ids.map(id => getRecord(id)));
  const removidos = registros.filter(Boolean).map(r => ({
    id: r.id, empresa: r.empresa, numeros: r.numeros, servidor: r.servidor, operadora: r.operadora, status: r.status
  }));
  await pool.query('DELETE FROM numeros WHERE id IN (?)', [ids]);
  clearStatsCache();
  await logAction((req.user||{}).userId || req.session.userId, 'REMOVER_LOTE', 'numero', null, { qtd: ids.length, registros: removidos });
  res.json({ ok: true, deleted: ids.length });
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTÓRICO
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/historico', requirePermissao('ver_historico'), async (req, res) => {
  const { page = 1, limit = 50, entidade, acao } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  let where = 'WHERE 1=1';
  const params = [];
  if (entidade) { where += ' AND h.entidade = ?'; params.push(entidade); }
  if (acao)     { where += ' AND h.acao = ?'; params.push(acao); }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM historico h ${where}`, params);
  const [rows] = await pool.query(
    `SELECT h.*, u.nome AS usuario_nome, u.username FROM historico h
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     ${where} ORDER BY h.criado_em DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );
  res.json({ data: rows, total: Number(total) });
});

// Histórico específico de um registro (audit)
app.get('/api/historico/:entidade/:id', requirePermissao('ver_historico'), async (req, res) => {
  const { entidade, id } = req.params;
  const { limit = 20 } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT h.acao, h.detalhes, h.criado_em, u.nome AS usuario_nome, u.username 
       FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.entidade = ? AND h.entidade_id = ?
       ORDER BY h.criado_em DESC LIMIT ?`,
      [entidade, id, Number(limit)]
    );
    res.json({ data: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

async function getFilteredNumeros(q, status) {
  let where = 'WHERE 1=1';
  const params = [];
  if (status && status !== 'todos') { where += ' AND n.status = ?'; params.push(status); }
  if (q) {
    where += ` AND (n.empresa LIKE ? OR n.servidor LIKE ? OR n.operadora LIKE ? OR
      EXISTS (SELECT 1 FROM numero_telefones nt WHERE nt.numero_id = n.id AND nt.telefone LIKE ?))`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const [rows] = await pool.query(`SELECT n.* FROM numeros n ${where} ORDER BY n.id DESC`, params);
  if (rows.length) {
    const ids = rows.map(r => r.id);
    const [tels] = await pool.query(`SELECT numero_id, telefone FROM numero_telefones WHERE numero_id IN (?)`, [ids]);
    const telMap = {};
    tels.forEach(t => { if (!telMap[t.numero_id]) telMap[t.numero_id] = []; telMap[t.numero_id].push(t.telefone); });
    rows.forEach(r => { r.numeros = telMap[r.id] || []; });
  }
  return rows;
}

app.get('/api/export/excel', requirePermissao('exportar'), async (req, res) => {
  const rows = await getFilteredNumeros(req.query.q || '', req.query.status);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TeleCRM';
  const ws = wb.addWorksheet('Números', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Empresa', key: 'empresa', width: 40 },
    { header: 'Números', key: 'numeros', width: 25 },
    { header: 'Operadora', key: 'operadora', width: 15 },
    { header: 'Servidor', key: 'servidor', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Data Ativação', key: 'data_ativacao', width: 16 },
    { header: 'Contrato', key: 'contrato', width: 30 },
    { header: 'Observações', key: 'obs', width: 35 },
  ];
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1f2e' } };
    cell.font = { bold: true, color: { argb: 'FF00e5a0' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF00e5a0' } } };
  });
  ws.getRow(1).height = 22;
  rows.forEach((r, i) => {
    const row = ws.addRow({
      id: r.id, empresa: r.empresa, numeros: (r.numeros||[]).join(', '),
      operadora: r.operadora||'', servidor: r.servidor||'', status: r.status,
      data_ativacao: r.data_ativacao ? new Date(r.data_ativacao).toLocaleDateString('pt-BR') : '',
      contrato: r.contrato||'', obs: r.obs||'',
    });
    const sc = row.getCell('status');
    if (r.status==='Ativo')    sc.font = { color: { argb: 'FF00c47a' }, bold: true };
    if (r.status==='Inativo')  sc.font = { color: { argb: 'FFff4560' }, bold: true };
    if (r.status==='Pendente') sc.font = { color: { argb: 'FFffb800' }, bold: true };
    if (i%2===1) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e2230' } }; });
    row.eachCell(cell => { cell.alignment = { vertical: 'middle' }; });
  });
  ws.autoFilter = { from: 'A1', to: 'I1' };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="telecrm_${new Date().toISOString().split('T')[0]}.xlsx"`);
  await wb.xlsx.write(res);
  await logAction((req.user||{}).userId || req.session.userId, 'EXPORTAR_EXCEL', 'sistema', null, { total: rows.length });
  res.end();
});

app.get('/api/export/csv', requirePermissao('exportar'), async (req, res) => {
  const rows = await getFilteredNumeros(req.query.q || '', req.query.status);
  const csvData = rows.map(r => ({
    id: r.id, empresa: r.empresa, numeros: (r.numeros||[]).join(';'),
    operadora: r.operadora||'', servidor: r.servidor||'', status: r.status,
    data_ativacao: r.data_ativacao ? new Date(r.data_ativacao).toLocaleDateString('pt-BR') : '',
    contrato: r.contrato||'', obs: r.obs||''
  }));
  const csv = stringify(csvData, { header: true, delimiter: ';' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="telecrm_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\uFEFF' + csv);
  await logAction((req.user||{}).userId || req.session.userId, 'EXPORTAR_CSV', 'sistema', null, { total: rows.length });
});

// Exportar portabilidade CSV
app.get('/api/export/porta/csv', requirePermissao('exportar'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM portabilidade ORDER BY id');
  const csvData = rows.map(r => ({
    id: r.id, empresa: r.empresa, cnpj_cpf: r.cnpj_cpf||'', titular: r.titular||'',
    numeros: r.numeros||'', operadora_origem: r.operadora_origem||'',
    operadora_destino: r.operadora_destino||'', protocolo: r.protocolo||'',
    status: r.status, data_abertura: r.data_abertura ? new Date(r.data_abertura).toLocaleDateString('pt-BR') : '',
    data_previsao: r.data_previsao ? new Date(r.data_previsao).toLocaleDateString('pt-BR') : '',
    data_conclusao: r.data_conclusao ? new Date(r.data_conclusao).toLocaleDateString('pt-BR') : '',
    obs: r.obs||''
  }));
  const csv = stringify(csvData, { header: true, delimiter: ';' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="portabilidade_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\uFEFF' + csv);
  await logAction((req.user||{}).userId || req.session.userId, 'EXPORTAR_PORTA_CSV', 'sistema', null, { total: rows.length });
});

// Exportar portabilidade Excel
app.get('/api/export/porta/excel', requirePermissao('exportar'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM portabilidade ORDER BY id');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Portabilidade');
  ws.columns = [
    { header: 'ID', key: 'id' }, { header: 'Empresa', key: 'empresa' },
    { header: 'CNPJ/CPF', key: 'cnpj_cpf' }, { header: 'Titular', key: 'titular' },
    { header: 'Números', key: 'numeros' }, { header: 'Operadora Origem', key: 'operadora_origem' },
    { header: 'Operadora Destino', key: 'operadora_destino' }, { header: 'Protocolo', key: 'protocolo' },
    { header: 'Status', key: 'status' }, { header: 'Data Abertura', key: 'data_abertura' },
    { header: 'Data Previsão', key: 'data_previsao' }, { header: 'Data Conclusão', key: 'data_conclusao' },
    { header: 'Observações', key: 'obs' }
  ];
  rows.forEach(r => ws.addRow({
    ...r, data_abertura: r.data_abertura ? new Date(r.data_abertura) : null,
    data_previsao: r.data_previsao ? new Date(r.data_previsao) : null,
    data_conclusao: r.data_conclusao ? new Date(r.data_conclusao) : null
  }));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="portabilidade_${new Date().toISOString().split('T')[0]}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
  await logAction((req.user||{}).userId || req.session.userId, 'EXPORTAR_PORTA_EXCEL', 'sistema', null, { total: rows.length });
});

// ══════════════════════════════════════════════════════════════════════════════
// IMPORTAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/import/csv', requirePermissao('importar'), uploadMem.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
  let records;
  try {
    const text = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    records = parse(text, { columns: true, delimiter: ';', skip_empty_lines: true, trim: true });
  } catch(e) { return res.status(400).json({ error: 'CSV inválido: ' + e.message }); }

  let criados = 0, erros = [];
  for (const [i, r] of records.entries()) {
    const empresa = r.empresa || r.Empresa;
    if (!empresa) { erros.push(`Linha ${i+2}: empresa vazia`); continue; }
    try {
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO numeros (empresa, operadora, servidor, status, contrato, obs, data_ativacao) VALUES (?,?,?,?,?,?,?)`,
        [empresa, r.operadora||r.Operadora||null, r.servidor||r.Servidor||null,
         r.status||r.Status||'Ativo', r.contrato||null, r.obs||null, null]
      );
      const id = result.insertId;
      const nums = (r.numeros||r.Numeros||r['número']||'').split(/[;,]/).map(n=>n.trim()).filter(Boolean);
      if (nums.length) await conn.query('INSERT INTO numero_telefones (numero_id, telefone) VALUES ?', [nums.map(n=>[id,n])]);
      await conn.commit(); conn.release(); criados++;
    } catch(e) { erros.push(`Linha ${i+2}: ${e.message}`); }
  }
  await logAction((req.user||{}).userId || req.session.userId, 'IMPORTAR_CSV', 'sistema', null, { criados, erros: erros.length });
  res.json({ ok: true, criados, erros });
});

app.get('/api/import/template', requirePermissao('importar'), (req, res) => {
  const t = 'empresa;numeros;operadora;servidor;status;contrato;obs\n' +
    'EMPRESA EXEMPLO;35221560;AMERICANET;179.127.199.50;Ativo;;\n' +
    'OUTRA EMPRESA;11999887766;VIVO;10.0.0.1;Ativo;;Observação aqui\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template_importacao.csv"');
  res.send('\uFEFF' + t);
});

// ══════════════════════════════════════════════════════════════════════════════
// PORTABILIDADE
// ══════════════════════════════════════════════════════════════════════════════

async function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS qtd FROM portabilidade WHERE YEAR(criado_em) = ?`, [ano]
  );
  const seq = String(r.qtd + 1).padStart(4, '0');
  return `PORTA-${ano}-${seq}`;
}

async function getPedido(id) {
  const [[p]] = await pool.query('SELECT * FROM portabilidade WHERE id = ?', [id]);
  if (!p) return null;
  const [docs] = await pool.query('SELECT id, pedido_id, categoria, versao, nome_original, mime_type, tamanho, enviado_por, enviado_em FROM portabilidade_docs WHERE pedido_id = ? ORDER BY enviado_em', [id]);
  p.numeros = typeof p.numeros === 'string' ? JSON.parse(p.numeros) : p.numeros;
  p.docs = docs;
  return p;
}

// Listar pedidos
app.get('/api/portabilidade', requirePermissao('ver_portabilidade'), async (req, res) => {
  const { q = '', status, page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  let where = 'WHERE 1=1';
  const params = [];
  if (status && status !== 'todos') { where += ' AND status = ?'; params.push(status); }
  if (q) { where += ' AND (empresa LIKE ? OR titular LIKE ? OR cnpj_cpf LIKE ? OR protocolo LIKE ?)'; const l = `%${q}%`; params.push(l,l,l,l); }
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM portabilidade ${where}`, params);
  const [rows] = await pool.query(
    `SELECT p.*, u.nome AS criado_por_nome FROM portabilidade p
     LEFT JOIN usuarios u ON u.id = p.criado_por
     ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );
  rows.forEach(r => { r.numeros = typeof r.numeros === 'string' ? JSON.parse(r.numeros) : r.numeros; });

  // Stats
  const [stats] = await pool.query(`SELECT status, COUNT(*) AS qtd FROM portabilidade GROUP BY status`);
  const statsMap = { Aberto:0, 'Em analise':0, 'Aguardando documentos':0, Concluído:0, Cancelado:0 };
  stats.forEach(s => statsMap[s.status] = s.qtd);

  res.json({ data: rows, total: Number(total), stats: statsMap });
});

// Buscar pedido por ID
app.get('/api/portabilidade/:id', requirePermissao('ver_portabilidade'), async (req, res) => {
  const p = await getPedido(req.params.id);
  if (!p) return res.status(404).json({ error: 'Não encontrado' });
  res.json(p);
});

// Criar pedido
app.post('/api/portabilidade', requirePermissao('criar_portabilidade'), async (req, res) => {
  try {
  const { empresa, cnpj_cpf, titular, numeros = [], operadora_origem, operadora_destino,
          protocolo, status = 'Aberto', data_abertura, data_previsao, obs, numero_id } = req.body;
  if (!empresa) return res.status(400).json({ error: 'Empresa obrigatória' });
  const protocoloFinal = protocolo || await gerarProtocolo();
  const [r] = await pool.query(
    `INSERT INTO portabilidade (empresa, cnpj_cpf, titular, numeros, operadora_origem, operadora_destino,
      protocolo, status, data_abertura, data_previsao, obs, numero_id, criado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [empresa, cnpj_cpf||null, titular||null, JSON.stringify(numeros),
     operadora_origem||null, operadora_destino||null, protocoloFinal,
     status, data_abertura||null, data_previsao||null, obs||null,
     numero_id||null, req.session.userId]
  );
  const pedido = await getPedido(r.insertId);
  await logAction((req.user||{}).userId || req.session.userId, 'CRIAR_PORTA', 'portabilidade', r.insertId, {
    empresa, titular, cnpj_cpf, numeros, operadora_origem, operadora_destino, protocolo: protocoloFinal, status, obs
  });
  res.json(pedido);
  } catch(e) { console.error('CRIAR_PORTA:', e); res.status(500).json({ error: e.message }); }
});

// Editar pedido
app.put('/api/portabilidade/:id', requirePermissao('editar_portabilidade'), async (req, res) => {
  try {
  const antes = await getPedido(req.params.id);
  const { empresa, cnpj_cpf, titular, numeros = [], operadora_origem, operadora_destino,
          protocolo, status, data_abertura, data_previsao, data_conclusao, obs, numero_id } = req.body;
  await pool.query(
    `UPDATE portabilidade SET empresa=?, cnpj_cpf=?, titular=?, numeros=?, operadora_origem=?,
     operadora_destino=?, protocolo=?, status=?, data_abertura=?, data_previsao=?,
     data_conclusao=?, obs=?, numero_id=? WHERE id=?`,
    [empresa, cnpj_cpf||null, titular||null, JSON.stringify(numeros),
     operadora_origem||null, operadora_destino||null, protocolo||null,
     status, data_abertura||null, data_previsao||null, data_conclusao||null,
     obs||null, numero_id||null, req.params.id]
  );
  const depois = await getPedido(req.params.id);
  const statusMudou = antes?.status !== status;

  // Se acabou de ser Concluído → copia para tabela numeros
  let numeroCopiadoId = null;
  if (statusMudou && status === 'Concluido' && antes?.status !== 'Concluido') {
    try {
      const numerosArr = typeof numeros === 'string' ? JSON.parse(numeros) : numeros;
      // Verifica se empresa já existe
      const [[existing]] = await pool.query('SELECT id FROM numeros WHERE empresa = ? LIMIT 1', [empresa]);
      if (existing) {
        // Adiciona os números ao registro existente
        const [[nr]] = await pool.query('SELECT telefones FROM numero_telefones WHERE numero_id = ? LIMIT 1', [existing.id]).catch(() => [[null]]);
        for (const tel of numerosArr) {
          await pool.query('INSERT IGNORE INTO numero_telefones (numero_id, telefone) VALUES (?,?)', [existing.id, tel]);
        }
        numeroCopiadoId = existing.id;
        await logAction((req.user||{}).userId || req.session.userId, 'PORTA_CONCLUIDA_ADD', 'numero', existing.id, {
          empresa, numeros: numerosArr, origem: 'portabilidade', pedido_id: req.params.id
        });
      } else {
        // Cria novo registro
        const [nr] = await pool.query(
          `INSERT INTO numeros (empresa, operadora, servidor, status, contrato, obs) VALUES (?,?,?,?,?,?)`,
          [empresa, operadora_destino||null, null, 'Ativo',
           depois.contrato||null, `Portabilidade concluída - Protocolo: ${depois.protocolo}`]
        );
        for (const tel of numerosArr) {
          await pool.query('INSERT IGNORE INTO numero_telefones (numero_id, telefone) VALUES (?,?)', [nr.insertId, tel]);
        }
        numeroCopiadoId = nr.insertId;
        await logAction((req.user||{}).userId || req.session.userId, 'PORTA_CONCLUIDA_CRIAR', 'numero', nr.insertId, {
          empresa, numeros: numerosArr, origem: 'portabilidade', pedido_id: req.params.id
        });
      }
      // Vincula o pedido ao registro de número
      await pool.query('UPDATE portabilidade SET numero_id = ? WHERE id = ?', [numeroCopiadoId, req.params.id]);
    } catch(e) {
      console.error('Erro ao copiar para Números:', e.message);
    }
  }

  await logAction((req.user||{}).userId || req.session.userId, statusMudou ? 'STATUS_PORTA' : 'EDITAR_PORTA', 'portabilidade', req.params.id, {
    empresa, titular, cnpj_cpf, numeros, protocolo,
    operadora_origem, operadora_destino, obs,
    status_anterior: antes?.status,
    status_novo: status,
    status_mudou: statusMudou,
    copiado_para_numeros: numeroCopiadoId
  });
  res.json({ ...depois, numero_id: numeroCopiadoId || depois.numero_id });
  } catch(e) { console.error('EDITAR_PORTA:', e); res.status(500).json({ error: e.message }); }
});

// Remover pedido
app.delete('/api/portabilidade/:id', requirePermissao('remover_portabilidade'), async (req, res) => {
  const p = await getPedido(req.params.id);
  // Remove arquivos físicos
  if (p?.docs?.length) {
    p.docs.forEach(d => {
      const f = path.join(docsDir, d.nome_arquivo);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }
  await pool.query('DELETE FROM portabilidade WHERE id = ?', [req.params.id]);
  await logAction((req.user||{}).userId || req.session.userId, 'REMOVER_PORTA', 'portabilidade', req.params.id, { empresa: p?.empresa });
  res.json({ ok: true });
});

// Upload de documento
app.post('/api/portabilidade/:id/docs', requirePermissao('editar_portabilidade'), uploadDoc.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
  const { categoria = 'Outro' } = req.body;
  // Calcular próxima versão para esta categoria neste pedido
  const [[last]] = await pool.query(
    `SELECT versao FROM portabilidade_docs WHERE pedido_id=? AND categoria=? ORDER BY id DESC LIMIT 1`,
    [req.params.id, categoria]
  );
  let versao = '1.0';
  if (last) {
    const parts = last.versao.split('.').map(Number);
    parts[1] = (parts[1] || 0) + 1;
    versao = parts.join('.');
  }
  const userId = (req.user||{}).userId || req.session.userId;
  const [r] = await pool.query(
    `INSERT INTO portabilidade_docs (pedido_id, categoria, versao, nome_original, mime_type, tamanho, conteudo, enviado_por)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.params.id, categoria, versao, req.file.originalname,
     req.file.mimetype, req.file.size, req.file.buffer, userId]
  );
  res.json({ ok: true, id: r.insertId, nome: req.file.originalname, categoria, versao,
    url: `/api/portabilidade/${req.params.id}/docs/${r.insertId}/download` });
});

// Download de documento
app.get('/api/portabilidade/:id/docs/:docId/download', requirePermissao('ver_portabilidade'), async (req, res) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM portabilidade_docs WHERE id=? AND pedido_id=?', [req.params.docId, req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Não encontrado' });
    res.set('Content-Type', doc.mime_type || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nome_original)}"`);
    res.send(doc.conteudo);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Remover documento
app.delete('/api/portabilidade/:id/docs/:docId', requirePermissao('editar_portabilidade'), async (req, res) => {
  const [[doc]] = await pool.query('SELECT id FROM portabilidade_docs WHERE id=? AND pedido_id=?', [req.params.docId, req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  await pool.query('DELETE FROM portabilidade_docs WHERE id=?', [req.params.docId]);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// BACKUP & RESTORE
// ══════════════════════════════════════════════════════════════════════════════

// Gerar backup completo (JSON + gzip)
app.get('/api/backup', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin' && (req.user||{}).role !== 'admin')
    return res.status(403).json({ error: 'Apenas admin' });
  try {
    const [numeros]   = await pool.query('SELECT * FROM numeros');
    const [telefones] = await pool.query('SELECT * FROM numero_telefones');
    const [operadoras]= await pool.query('SELECT * FROM operadoras');
    const [usuarios]  = await pool.query('SELECT id,username,nome,senha_hash,role,permissoes,ativo,criado_em FROM usuarios');
    const [config]    = await pool.query('SELECT * FROM configuracoes WHERE chave != \'app_logo\'');
    const [porta]     = await pool.query('SELECT * FROM portabilidade');
    const [portaDocs] = await pool.query('SELECT id,pedido_id,categoria,versao,nome_original,mime_type,tamanho,conteudo,enviado_por,enviado_em FROM portabilidade_docs');
    const [historico] = await pool.query('SELECT * FROM historico ORDER BY id DESC LIMIT 5000');

    portaDocs.forEach(d => { if (d.conteudo) d.conteudo = d.conteudo.toString('base64'); });

    const backup = {
      versao: '2.0',
      gerado_em: new Date().toISOString(),
      sistema: 'VoipFlow',
      dados: { numeros, telefones, operadoras, usuarios, config, portabilidade: porta, portabilidade_docs: portaDocs, historico }
    };

    const jsonStr = JSON.stringify(backup);
    const gzipped = zlib.gzipSync(Buffer.from(jsonStr));
    
    res.set('Content-Type', 'application/gzip');
    res.set('Content-Disposition', `attachment; filename="voipflow-backup-${new Date().toISOString().split('T')[0]}.json.gz"`);
    res.send(gzipped);
    await logAction((req.user||{}).userId||req.session.userId, 'BACKUP', 'sistema', null, { tabelas: Object.keys(backup.dados) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Restaurar backup
app.post('/api/restore', requireAuth, uploadMem.single('backup'), async (req, res) => {
  console.log('Restore request, user:', req.user?.username, 'role:', req.user?.role);
  if (req.session.role !== 'admin' && (req.user||{}).role !== 'admin') {
    console.log('Restore denied - not admin');
    return res.status(403).json({ error: 'Apenas admin' });
  }
  try {
    let backup;
    const isGz = req.file.originalname.endsWith('.gz') || req.file.mimetype === 'application/gzip';
    if (isGz) {
      const decompressed = zlib.gunzipSync(req.file.buffer);
      backup = JSON.parse(decompressed.toString());
    } else {
      backup = JSON.parse(req.file.buffer.toString());
    }
    if (!backup.dados) return res.status(400).json({ error: 'Arquivo inválido' });
    const d = backup.dados;
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      // Limpar tabelas
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      for (const t of ['historico','portabilidade_docs','portabilidade','numero_telefones','numeros','operadoras','configuracoes']) {
        await conn.query(`DELETE FROM ${t}`).catch(()=>{});
      }
      await conn.query('SET FOREIGN_KEY_CHECKS=1');

      const parseDate = (v) => {
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
      };

      // Restaurar dados
      const insert = async (table, rows, cols) => {
        if (!rows?.length) return;
        for (const row of rows) {
          const vals = cols.map(c => {
            if ((c === 'criado_em' || c === 'data_ativacao' || c === 'data_abertura' || c === 'data_previsao' || c === 'data_conclusao' || c === 'enviado_em') && row[c]) {
              return parseDate(row[c]);
            }
            return row[c] !== undefined ? row[c] : null;
          });
          await conn.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`, vals);
        }
      };

      await insert('operadoras', d.operadoras, ['nome']);
      await insert('numeros', d.numeros, ['id','empresa','operadora','servidor','status','contrato','obs','criado_em']);
      await insert('numero_telefones', d.telefones, ['id','numero_id','telefone']);
      // Não restaurar usuários para não perder o admin atual
      if (d.config) for (const c of d.config) {
        await conn.query('INSERT INTO configuracoes (chave,valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=?', [c.chave,c.valor,c.valor]);
      }
      if (d.portabilidade?.length) {
        await insert('portabilidade', d.portabilidade, ['id','numero_id','empresa','cnpj_cpf','titular','numeros','operadora_origem','operadora_destino','protocolo','status','data_abertura','data_previsao','data_conclusao','obs','criado_por','criado_em']);
      }
      if (d.portabilidade_docs?.length) {
        for (const doc of d.portabilidade_docs) {
          const blob = doc.conteudo ? Buffer.from(doc.conteudo, 'base64') : null;
          await conn.query(
            `INSERT INTO portabilidade_docs (id,pedido_id,categoria,versao,nome_original,mime_type,tamanho,conteudo,enviado_por,enviado_em) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [doc.id,doc.pedido_id,doc.categoria,doc.versao||'1.0',doc.nome_original,doc.mime_type,doc.tamanho,blob,doc.enviado_por,parseDate(doc.enviado_em)]
          );
        }
      }

      await conn.commit();
      conn.release();
      await logAction((req.user||{}).userId||req.session.userId, 'RESTORE', 'sistema', null, { backup_data: backup.gerado_em });
      res.json({ ok: true, msg: 'Backup restaurado com sucesso!' });
    } catch(e) {
      await conn.rollback(); conn.release();
      throw e;
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// ── Retry de conexão com banco ────────────────────────────────────────────────
async function waitForDB(retries = 30, delay = 3000) {
  console.log('⏳ Aguardando banco de dados...');
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Banco de dados conectado!');
      return true;
    } catch(e) {
      console.log(`⏳ Tentativa ${i+1}/${retries} - ${e.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error('❌ Não foi possível conectar ao banco. Encerrando...');
  process.exit(1);
}

async function ensureAdminUser() {
  try {
    const [[existing]] = await pool.query("SELECT id FROM usuarios WHERE username = 'admin'");
    const hash = await bcrypt.hash('admin123', 10);
    if (!existing) {
      await pool.query(
        "INSERT INTO usuarios (username, nome, senha_hash, role) VALUES ('admin','Administrador',?,'admin')",
        [hash]
      );
      console.log('✅ Usuário admin criado (senha: admin123)');
    } else {
      await pool.query("UPDATE usuarios SET senha_hash=? WHERE username='admin'", [hash]);
      console.log('✅ Hash do admin sincronizado');
    }
  } catch(e) {
    console.error('Erro ao garantir admin:', e.message);
  }
}

async function ensureConfigTable() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS configuracoes (
      chave VARCHAR(100) PRIMARY KEY,
      valor TEXT,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await pool.query(`INSERT IGNORE INTO configuracoes (chave, valor) VALUES
      ('app_nome','TeleCRM'),
      ('app_subtitulo','Gestão de Números de Telefonia'),
      ('app_logo','')`);

  // Migração: adicionar coluna permissoes se não existir
  try {
    await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes JSON');
    console.log('✅ Coluna permissoes ok');
  } catch(e) { console.log('permissoes col:', e.message); }
  } catch(e) { console.error('Config table error:', e.message); }

}

async function ensurePortabilidade() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS portabilidade (
      id INT AUTO_INCREMENT PRIMARY KEY,
      numero_id INT DEFAULT NULL,
      empresa VARCHAR(255) NOT NULL,
      cnpj_cpf VARCHAR(20) DEFAULT NULL,
      titular VARCHAR(255) DEFAULT NULL,
      numeros JSON NOT NULL,
      operadora_origem VARCHAR(100) DEFAULT NULL,
      operadora_destino VARCHAR(100) DEFAULT NULL,
      protocolo VARCHAR(100) DEFAULT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Aberto',
      data_abertura DATE DEFAULT NULL,
      data_previsao DATE DEFAULT NULL,
      data_conclusao DATE DEFAULT NULL,
      obs TEXT DEFAULT NULL,
      criado_por INT DEFAULT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('✅ Tabela portabilidade ok');
  } catch(e) { console.error('❌ ERRO portabilidade:', e.message); }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS portabilidade_docs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pedido_id INT NOT NULL,
      categoria VARCHAR(50) NOT NULL DEFAULT 'Outro',
      versao VARCHAR(10) NOT NULL DEFAULT '1.0',
      nome_original VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) DEFAULT NULL,
      tamanho INT DEFAULT NULL,
      conteudo LONGBLOB,
      enviado_por INT DEFAULT NULL,
      enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pedido (pedido_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Migração: adicionar colunas se não existirem
    await pool.query('ALTER TABLE portabilidade_docs ADD COLUMN IF NOT EXISTS conteudo LONGBLOB').catch(()=>{});
    await pool.query('ALTER TABLE portabilidade_docs ADD COLUMN IF NOT EXISTS versao VARCHAR(10) NOT NULL DEFAULT \'1.0\'').catch(()=>{});
    await pool.query('ALTER TABLE portabilidade_docs DROP COLUMN IF EXISTS nome_arquivo').catch(()=>{});
    console.log('✅ Tabela portabilidade_docs ok');
  } catch(e) { console.error('❌ ERRO portabilidade_docs:', e.message); }
}

(async () => {
  await waitForDB();
  await ensureAdminUser();
  await ensureConfigTable();
  await ensurePortabilidade();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`TeleCRM API v2 rodando na porta ${PORT}`));
})();
