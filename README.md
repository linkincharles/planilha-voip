# TeleCRM v2 📞

Sistema completo de gerência de números de telefonia com MariaDB, Node.js e Docker.

## 🚀 Como subir

```bash
# 1. Extraia o zip e entre na pasta
unzip telecrm.zip && cd telecrm

# 2. Se já tinha versão anterior, limpe tudo:
docker compose down -v

# 3. Suba tudo
docker compose up -d

# 4. Aguarde ~20s e acesse
# http://localhost
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
- Busca em tempo real
- Paginação

### 📊 Exportação
- **Excel (.xlsx)** — formatado com cores e filtros automáticos
- **CSV** — compatível com Excel (separador `;`, BOM UTF-8)
- Exporta apenas o que está filtrado na tela

### 📥 Importação em Massa
- Upload de CSV arrastando ou clicando
- Baixe o template de exemplo no modal de importação
- Mostra relatório de criados/erros após importar

### 📜 Histórico de Alterações
- Registra todas as ações: criar, editar, remover, importar, exportar
- Filtra por tipo de ação e entidade
- Mostra usuário, data/hora e detalhes

### 👥 Gerenciamento de Usuários (Admin)
- Criar usuários com perfil **Admin** ou **Operador**
- Ativar/desativar usuários
- Ver último acesso de cada usuário

### ⚙️ Operadoras
- Adicionar e remover operadoras pelo menu da interface

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
│   └── server.js        ← API REST completa
└── frontend/
    └── index.html       ← Interface completa
```

---

## 🔌 API Endpoints

| Método | Rota                     | Descrição              |
|--------|--------------------------|------------------------|
| POST   | /api/auth/login          | Login                  |
| POST   | /api/auth/logout         | Logout                 |
| GET    | /api/numeros             | Listar/filtrar         |
| POST   | /api/numeros             | Criar                  |
| PUT    | /api/numeros/:id         | Editar                 |
| DELETE | /api/numeros/:id         | Remover                |
| DELETE | /api/numeros             | Remover em lote        |
| GET    | /api/export/excel        | Exportar Excel         |
| GET    | /api/export/csv          | Exportar CSV           |
| POST   | /api/import/csv          | Importar CSV           |
| GET    | /api/import/template     | Baixar template CSV    |
| GET    | /api/historico           | Histórico de ações     |
| GET    | /api/usuarios            | Listar usuários        |
| POST   | /api/usuarios            | Criar usuário          |
| PUT    | /api/usuarios/:id        | Editar usuário         |
| DELETE | /api/usuarios/:id        | Remover usuário        |

---

## 🛢️ Acesso direto ao banco

```bash
docker exec -it telecrm_db mariadb -u telecrm -ptelecrm_pass telecrm
```
