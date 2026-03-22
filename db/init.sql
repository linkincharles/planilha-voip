CREATE DATABASE IF NOT EXISTS telecrm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE telecrm;

CREATE TABLE IF NOT EXISTS operadoras (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL UNIQUE
);
INSERT IGNORE INTO operadoras (nome) VALUES ('AMERICANET'),('IDT'),('VIVO'),('CLARO'),('OI'),('TIM'),('EMBRATEL'),('INTELIG');

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  nome          VARCHAR(100) NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  role          ENUM('admin','operador') NOT NULL DEFAULT 'operador',
  permissoes    JSON,
  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  ultimo_acesso DATETIME
);
-- admin / admin123
INSERT IGNORE INTO usuarios (username, nome, senha_hash, role) VALUES
  ('admin','Administrador','$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVKwo8azTK','admin');

CREATE TABLE IF NOT EXISTS numeros (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  empresa       VARCHAR(255) NOT NULL,
  operadora     VARCHAR(100),
  servidor      VARCHAR(100),
  status        ENUM('Ativo','Inativo','Pendente') NOT NULL DEFAULT 'Ativo',
  contrato      VARCHAR(255),
  obs           TEXT,
  data_ativacao DATE,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS numero_telefones (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  numero_id INT NOT NULL,
  telefone  VARCHAR(30) NOT NULL,
  FOREIGN KEY (numero_id) REFERENCES numeros(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS historico (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT,
  acao        VARCHAR(50) NOT NULL,
  entidade    VARCHAR(50),
  entidade_id VARCHAR(20),
  detalhes    JSON,
  criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entidade (entidade, entidade_id),
  INDEX idx_usuario  (usuario_id),
  INDEX idx_criado   (criado_em)
);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave     VARCHAR(100) PRIMARY KEY,
  valor     TEXT,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO configuracoes (chave, valor) VALUES
  ('app_nome',      'TeleCRM'),
  ('app_subtitulo', 'Gestão de Números de Telefonia'),
  ('app_logo',      '');

-- Dados de exemplo
INSERT IGNORE INTO numeros (id, empresa, operadora, servidor, status, data_ativacao) VALUES
  (1,'BARATAO','AMERICANET','179.127.199.50','Ativo','2026-02-24'),
  (2,'IGREJA PRESBITERIANA MONTE HOREBE DA FIQUEIRA','AMERICANET','179.127.199.178','Ativo','2026-02-09'),
  (3,'RESERVADO CONECTA GUAPI','IDT','179.127.199.178','Ativo','2026-01-23'),
  (4,'RESERVADO CONECTA GUAPI','IDT','179.127.199.178','Ativo','2026-01-23'),
  (5,'LEON FARES CONECTA GUAPI','IDT','179.127.199.106','Ativo','2026-01-23'),
  (6,'AUTO ESCOLA MANTIQUIRA','IDT','10.5.22.18','Inativo','2026-01-22');

INSERT IGNORE INTO numero_telefones (numero_id, telefone) VALUES
  (1,'35221560'),(2,'27761918'),(3,'38784819'),(4,'38784818'),(5,'38784816'),(6,'38784829');

-- ── PORTABILIDADE ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portabilidade (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  numero_id        INT,                          -- vínculo opcional com cliente cadastrado
  empresa          VARCHAR(255) NOT NULL,
  cnpj_cpf         VARCHAR(20),
  titular          VARCHAR(255),
  numeros          JSON NOT NULL,                -- array de números a portar
  operadora_origem VARCHAR(100),
  operadora_destino VARCHAR(100),
  protocolo        VARCHAR(100),
  status           ENUM('Aberto','Em análise','Aguardando documentos','Concluído','Cancelado') NOT NULL DEFAULT 'Aberto',
  data_abertura    DATE,
  data_previsao    DATE,
  data_conclusao   DATE,
  obs              TEXT,
  criado_por       INT,
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (numero_id) REFERENCES numeros(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_empresa (empresa)
);

CREATE TABLE IF NOT EXISTS portabilidade_docs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id       INT NOT NULL,
  categoria       VARCHAR(50) NOT NULL DEFAULT 'Outro',
  versao          VARCHAR(10) NOT NULL DEFAULT '1.0',
  nome_original   VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100),
  tamanho         INT,
  conteudo        LONGBLOB,
  enviado_por     INT,
  enviado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
