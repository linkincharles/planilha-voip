# TeleCRM v2 📞

Sistema completo de gerência de números de telefonia com MariaDB, Node.js e Docker.

## 🚀 Como subir

O TeleCRM agora é distribuído via imagens Docker no GitHub Container Registry (GHCR).

```bash
# 1. Clone o projeto
git clone https://github.com/linkincharles/planilha-voip.git
cd planilha-voip

# 2. Configure suas variáveis de ambiente
# Copie .env.example para .env e edite com seus segredos e configurações
cp .env.example .env

# 3. Baixe e suba os serviços Docker (vai puxar as imagens do GHCR)
docker compose up -d

# 4. Aguarde ~20s e acesse o frontend
# http://localhost:9000
# Login padrão: admin / admin123
```

> ⚠️ **Ambientes com DPI:** Se seu ambiente bloquear `docker pull` de registries externos (ex: `ghcr.io`), você pode precisar buildar as imagens localmente:
> ```bash
> # Build local do backend
> docker build -t ghcr.io/linkincharles/planilha-voip-backend:latest ./backend
> # Build local do frontend
> docker build -f Dockerfile.frontend -t ghcr.io/linkincharles/planilha-voip-frontend:latest .
> # Depois suba com compose
> docker compose up -d
> ```

## 🔐 Login padrão

| Usuário | Senha    |
|---------|----------|
| admin   | admin123 |

> ⚠️ Troque a senha após o primeiro acesso em **Usuários → Editar**

---

## ✨ Funcionalidades

### 📋 Gestão de Números (Novo Modelo: 1 Telefone = 1 Registro)
- Adicionar, editar e remover registros (agora, cada registro representa um número de telefone único)
- Filtro por status (Ativo / Inativo / Pendente)
- **Filtro por data** (De / Até)
- Busca em tempo real
- **Ordenação por colunas** (clique no header)
- Paginação

### 📊 Dashboard
- Cards com Total, Ativos, Inativos, Pendentes
- Números cadastrados este mês e últimos 30 dias
- Gráficos por Operadora e Servidor
- Estatísticas de Portabilidade
- Lista de registros recentes

### 📊 Exportação
- **Excel (.xlsx)** — formatado com cores e filtros automáticos
- **CSV** — compatível com Excel (separador `;`, BOM UTF-8)
- Exporta apenas o que está filtrado na tela

### 📥 Importação em Massa
- Upload de CSV arrastando ou clicando
- Baixe o template de exemplo no modal de importação
- Mostra relatório de criados/erros após importar
- Suporta múltiplos telefones por linha no CSV (separados por `;` ou `,`) que são expandidos em registros individuais.

### 🔍 Consulta de Operadora (Integrado com Twilio Lookup)
- **Automática**: ao adicionar números na portabilidade
- **Página dedicada**: no menu do sistema
- **API configurável**: Suporte nativo para **Twilio Lookup** (`URL: twilio`, `Login: Account SID`, `Senha: Auth Token`) ou API customizada.
- Consulta manualmente qualquer número
- Mostra: Operadora, Portabilidade, Tipo, Estado, Cidade

### 📋 Portabilidade
- Gerenciamento de pedidos de portabilidade
- Status: Aberto, Em análise, Aguardando documentos, Concluído, Cancelado
- Upload de documentos (armazenados em BLOB no DB)
- **Geração de termo** para portabilidade (impressão) — agora com `Operadora Destino` no cabeçalho.
- Exportação Excel/CSV
- **Correção:** Deleção de pedidos de portabilidade e seus documentos relacionados agora funciona sem travar o servidor.

### 📜 Histórico de Alterações
- Registra todas as ações: criar, editar, remover, importar, exportar
- Filtra por tipo de ação e entidade
- Mostra usuário, data/hora e detalhes

### 💾 Backup e Restore
- **Backup compactado** (.json.gz)
- Restore aceita .json ou .json.gz
- **Nota:** Backups de versões antigas (com `numero_telefones` separado) precisam ser convertidos para o novo modelo "1 Telefone = 1 Registro" antes da restauração.

### 👥 Gerenciamento de Usuários (Admin)
- Criar usuários com perfil **Admin** ou **Operador**
- Permissões granulares por funcionalidade
- Ativar/desativar usuários
- Ver último acesso de cada usuário

### ⚙️ Configurações
- Nome e subtítulo do sistema
- Upload de logo
- **API de Consulta de Operadora** - Configure URL, login e senha (suporte a Twilio)
- Webhook para notificações
- Alterar senha

---

## 🛠️ Desenvolvimento / GitHub Actions

O projeto utiliza GitHub Actions para automatizar o build e push das imagens Docker para o GitHub Container Registry (GHCR).

- **Workflow:** `.github/workflows/docker-push.yml`
- **Trigger:** A cada `git push` de uma tag no formato `v*` (ex: `v2.11`)
- **Imagens geradas:**
    - `ghcr.io/linkincharles/planilha-voip-backend:latest`
    - `ghcr.io/linkincharles/planilha-voip-backend:<versão_da_tag>`
    - `ghcr.io/linkincharles/planilha-voip-frontend:latest`
    - `ghcr.io/linkincharles/planilha-voip-frontend:<versão_da_tag>`

---

## 📁 Estrutura

```
telecrm/
├── .env.example
├── docker-compose.yml
├── Dockerfile.frontend        ← Novo Dockerfile para o frontend (Nginx)
├── nginx.conf
├── db/init.sql                ← Schema + dados iniciais (atualizado para 1 telefone = 1 registro)
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js              ← API REST completa (atualizado para Twilio Lookup e fix de bugs)
├── frontend/
│   └── index.html             ← Interface completa (atualizado com UI/UX, Twilio e fix de bugs)
└── .github/                   ← Workflow para GitHub Actions
    └── workflows/
        └── docker-push.yml
```

---

## 🔌 API Endpoints
(Mantidos os mesmos endpoints, a implementação interna mudou)

### Auth
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| POST   | /api/auth/login          | Login                  |
| POST   | /api/auth/logout         | Logout                 |
| GET    | /api/auth/me             | Dados do usuário       |

### Números
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/numeros             | Listar/filtrar         |
| POST   | /api/numeros             | Criar                  |
| PUT    | /api/numeros/:id         | Editar                 |
| DELETE | /api/numeros/:id         | Remover                |
| DELETE | /api/numeros             | Remover em lote        |

### Dashboard
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/dashboard           | Estatísticas completas |

### Operadoras
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/operadoras          | Listar                 |
| POST   | /api/operadoras          | Criar                  |
| DELETE | /api/operadoras/:nome    | Remover                |

### Consulta Operadora
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/consulta-operadora  | Consulta por número    |

### Exportação
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/export/excel        | Exportar Excel         |
| GET    | /api/export/csv          | Exportar CSV           |
| GET    | /api/export/porta/excel  | Portabilidade Excel    |
| GET    | /api/export/porta/csv    | Portabilidade CSV      |

### Importação
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| POST   | /api/import/csv          | Importar CSV           |
| GET    | /api/import/template     | Baixar template        |

### Portabilidade
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/portabilidade       | Listar                 |
| POST   | /api/portabilidade       | Criar                  |
| PUT    | /api/portabilidade/:id   | Editar                 |
| DELETE | /api/portabilidade/:id   | Remover                |
| POST   | /api/portabilidade/:id/docs | Upload documento   |
| DELETE | /api/portabilidade/:id/docs/:docId | Remover documento |

### Histórico
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/historico           | Lista geral            |
| GET    | /api/historico/:entidade/:id | Histórico por registro |

### Usuários
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/usuarios            | Listar                 |
| POST   | /api/usuarios            | Criar                  |
| PUT    | /api/usuarios/:id        | Editar                 |
| DELETE | /api/usuarios/:id        | Remover                |

### Backup
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/backup              | Baixar backup (.gz)    |
| POST   | /api/restore             | Restaurar backup       |

### Configuração
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/config              | Ver config             |
| PUT    | /api/config              | Salvar config          |
| POST   | /api/config/logo         | Upload logo            |
| DELETE | /api/config/logo         | Remover logo           |
| GET    | /api/config/webhook      | Ver webhook            |
| PUT    | /api/config/webhook      | Salvar webhook         |
| POST   | /api/config/webhook/test | Testar webhook         |

---

## 🔧 Parâmetros de Query

### Listar números
```
GET /api/numeros?page=1&limit=50&q=busca&status=Ativo&from=2026-01-01&to=2026-04-30&sort=empresa&dir=asc
```

| Parâmetro | Descrição                                    |
|-----------|----------------------------------------------|
| page      | Página atual (padrão: 1)                     |
| limit     | Itens por página (padrão: 50)                |
| q         | Busca textual                                |
| status    | Filtrar por status                           |
| from      | Data início (data_ativacao)                  |
| to        | Data fim (data_ativacao)                     |
| sort      | Campo para ordenação                         |
| dir       | Direção: asc ou desc                         |

---

## 🛢️ Acesso direto ao banco

```bash
docker exec -it telecrm_db mariadb -u telecrm -ptelecrm_pass telecrm
```

---

## 📝 Requisitos

- Docker e Docker Compose
- MariaDB 11
- Node.js 20+
- Nginx (servindo frontend estático)
