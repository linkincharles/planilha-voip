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
  ('app_logo',      ''),
  ('api_consulta_operadora_url', ''),
  ('api_consulta_operadora_login', ''),
  ('api_consulta_operadora_senha', '');

-- ⚠️ Dados de exemplo REMOVIDOS: o init.sql roda em produção (docker-entrypoint-initdb.d).
-- Para popular ambiente de demo, use um script separado ou a interface do sistema.
