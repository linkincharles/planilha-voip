# TeleCRM v2 📞

Sistema completo de gerência de números de telefonia com MariaDB, Node.js e Docker.

## 🚀 Como subir

```bash
# 1. Entre na pasta do projeto
cd telecrm

# 2. Se já tinha versão anterior, limpe tudo:
docker compose down -v

# 3. Suba tudo
docker compose up -d --build

# 4. Aguarde ~20s e acesso
# http://localhost:9000
```

## 🔐 Login padrão

| Usuário | Senha    |
|---------|----------|
| admin   | admin123 |

> ⚠️ Troque a senha após o primeiro acesso em **Usuários → Editar**

---

## ✨ Funcionalidades

### 📋 Gestão de Números
- Adicionar, editar e remover registros
- Múltiplos números por empresa
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

### 🔍 Consulta de Operadora
- **Automática**: ao adicionar números na portabilidade
- **Página dedicada**: no menu do sistema
- **API configurável**: defina URL, login e senha em Configurações
- Consulta manualmente qualquer número
- Mostra: Operadora, Portabilidade, Tipo, Estado, Cidade

### 📋 Portabilidade
- Gerenciamento de pedidos de portabilidade
- Múltiplos números por pedido
- Status: Aberto, Em análise, Aguardando documentos, Concluído, Cancelado
- Upload de documentos (CPF, CNH, Contrato)
- **Geração de termo** para portabilidade (impressão)
- Exportação Excel/CSV

### 📜 Histórico de Alterações
- Registra todas as ações: criar, editar, remover, importar, exportar
- Filtra por tipo de ação e entidade
- Mostra usuário, data/hora e detalhes

### 💾 Backup e Restore
- **Backup compactado** (.json.gz)
- Restore aceita .json ou .json.gz

### 👥 Gerenciamento de Usuários (Admin)
- Criar usuários com perfil **Admin** ou **Operador**
- Permissões granulares por funcionalidade
- Ativar/desativar usuários
- Ver último acesso de cada usuário

### ⚙️ Configurações
- Nome e subtítulo do sistema
- Upload de logo
- **API de Consulta de Operadora** - Configure URL, login e senha
- Webhook para notificações
- Alterar senha

---

## 📁 Estrutura

```
telecrm/
├── docker-compose.yml
├── nginx.conf
├── db/init.sql          ← Schema + dados iniciais
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js        ← API REST completa (~1250 linhas)
└── frontend/
    └── index.html       ← Interface completa (~1950 linhas)
```

---

## 🔌 API Endpoints

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
| GET    | /api/dashboard           | Estatísticas completas|

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
| GET    | /api/export/porta/csv    | Portabilidade CSV     |

### Importação
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| POST   | /api/import/csv          | Importar CSV           |
| GET    | /api/import/template    | Baixar template        |

### Portabilidade
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/portabilidade       | Listar                 |
| POST   | /api/portabilidade       | Criar                  |
| PUT    | /api/portabilidade/:id   | Editar                 |
| DELETE | /api/portabilidade/:id  | Remover                |
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
| POST   | /api/restore            | Restaurar backup       |

### Configuração
| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| GET    | /api/config              | Ver config             |
| PUT    | /api/config              | Salvar config          |
| POST   | /api/config/logo        | Upload logo            |
| DELETE | /api/config/logo        | Remover logo           |
| GET    | /api/config/webhook     | Ver webhook            |
| PUT    | /api/config/webhook     | Salvar webhook         |
| POST   | /api/config/webhook/test | Testar webhook        |

---

## 🔧 Parâmetros de Query

### Listar números
```
GET /api/numeros?page=1&limit=50&q=busca&status=Ativo&from=2026-01-01&to=2026-04-30&sort=empresa&dir=asc
```

| Parâmetro | Descrição                    |
|-----------|-------------------------------|
| page      | Página atual (padrão: 1)     |
| limit     | Itens por página (padrão: 50)|
| q         | Busca textual                 |
| status    | Filtrar por status           |
| from      | Data início (data_ativacao)   |
| to        | Data fim (data_ativacao)     |
| sort      | Campo para ordenação          |
| dir       | Direção: asc ou desc          |

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