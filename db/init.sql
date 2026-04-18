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
  ('api_consulta_operadora_login', 'admin'),
  ('api_consulta_operadora_senha', '123');

-- Dados de exemplo
INSERT IGNORE INTO numeros (id, empresa, operadora, servidor, status, data_ativacao) VALUES
  (1,'TECNOLOGIA SOLUTIONS LTDA','VIVO','192.168.1.10','Ativo','2026-03-15'),
  (2,'CLÍNICA SAÚDE INTEGRADA','TIM','192.168.1.25','Ativo','2026-03-10'),
  (3,'ESCRITÓRIO CONTÁBIL MARCOS SILVA','CLARO','192.168.1.40','Ativo','2026-03-05'),
  (4,'ACADEMIA FORÇA E SAÚDE','OI','192.168.1.55','Ativo','2026-02-28'),
  (5,'RESTAURANTE SABOR CASEIRO','VIVO','192.168.1.70','Ativo','2026-02-20'),
  (6,'ESCOLA MUNICIPAL PEDAGOGICA','TIM','192.168.1.85','Inativo','2026-02-15'),
  (7,'PET SHOP AMIGO FIEL','CLARO','192.168.1.100','Pendente','2026-04-01'),
  (8,'LOJA DE ROUPAS ESTILO','OI','192.168.1.115','Ativo','2026-04-05');

INSERT IGNORE INTO numero_telefones (numero_id, telefone) VALUES
  (1,'1133334444'),(2,'1133335555'),(3,'1133336666'),(4,'1133337777'),(5,'1133338888'),(6,'1133339999'),(7,'1133330000'),(8,'1133331111');

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

-- Dados de exemplo de portabilidade
INSERT IGNORE INTO portabilidade (id, empresa, cnpj_cpf, numeros, operadora_origem, operadora_destino, protocolo, status, data_abertura, data_previsao) VALUES
  (1,'COMÉRCIO VAREJISTA LTDA','12.345.678/0001-90','["11988887777","11988887778"]','OI','VIVO','PORT-2026-0001','Aberto','2026-04-10','2026-04-17'),
  (2,'INDÚSTRIA METALÚRGICA ABC','98.765.432/0001-10','["11999990000"]','TIM','CLARO','PORT-2026-0002','Em análise','2026-04-08','2026-04-15'),
  (3,'SERVIÇOS DE CONSULTORIA XYZ','11.222.333/0001-44','["11977776666"]','VIVO','TIM','PORT-2026-0003','Concluído','2026-03-20','2026-03-27');
