# Guia de Migração — Tênis Entre Amigos

Este documento explica passo a passo como criar um novo projeto Supabase e migrar toda a estrutura do banco de dados.

---

## 1. Criar o novo projeto Supabase

1. Acesse https://supabase.com e faça login.
2. Clique em **New Project**.
3. Escolha a organização, dê um nome ao projeto (ex: `tenis-entre-amigos`).
4. Defina uma senha forte para o banco de dados.
5. Selecione a região mais próxima dos usuários (ex: South America / São Paulo).
6. Clique em **Create new project** e aguarde a provisionamento.

---

## 2. Extensões necessárias

A única extensão necessária é **pgcrypto** (para `gen_random_uuid()`).

O script `migration_complete.sql` já inclui `CREATE EXTENSION IF NOT EXISTS pgcrypto;` no início, então não é necessário habilitar manualmente.

---

## 3. Executar o migration_complete.sql

1. No painel do novo projeto Supabase, vá em **SQL Editor**.
2. Clique em **New query**.
3. Cole TODO o conteúdo do arquivo `supabase/migration_complete.sql`.
4. Clique em **Run** e aguarde a execução completa.

O script cria na ordem correta:
- 19 tabelas
- 21 índices
- 1 view (`public_profiles`)
- 18 funções PostgreSQL (SECURITY DEFINER)
- 2 triggers
- ~60 políticas RLS
- Permissões GRANT/REVOKE
- Realtime publication em 6 tabelas
- Storage bucket `avatars`
- Dado inicial em `ranking_meta`

---

## 4. Secrets necessários (Edge Functions)

As Edge Functions precisam dos seguintes secrets configurados no novo projeto:

### 4.1. Secrets do Supabase (automáticos)

| Nome | Descrição |
|------|-----------|
| `SUPABASE_URL` | URL do novo projeto (automático) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role do novo projeto (automático) |

> **Nota:** O Supabase injeta automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no runtime das Edge Functions. Não é necessário cadastrá-las manualmente.

### 4.2. Secrets adicionais (devem ser cadastrados manualmente)

| Nome | Onde configurar | Descrição |
|------|----------------|-----------|
| `TOURNAMENT_KEY_PEPPER` | Project Settings > Edge Functions > Secrets | String aleatória longa usada como "pepper" no hash das chaves de edição de torneios. Gere com `openssl rand -hex 32`. |
| `RESEND_API_KEY` | Project Settings > Edge Functions > Secrets | (Opcional) Chave da API Resend para envio de emails. Se não configurado, os emails são apenas logados no console. |
| `SITE_URL` | Project Settings > Edge Functions > Secrets | URL pública do frontend (ex: `https://tenis-entre-amigos.app`). Usada nos links dos emails. |

---

## 5. Configurar as Edge Functions

O projeto tem 2 Edge Functions em `supabase/functions/`:

### 5.1. `tournament-api`

- **Finalidade:** API REST para criar, listar, editar e excluir torneios no formato JSONB (legado). Gerencia chaves de edição com hash SHA-256 + pepper.
- **Arquivos:** `supabase/functions/tournament-api/index.ts` + `edit-key.ts`
- **verify_jwt:** `false` (endpoint público)
- **Secrets necessários:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOURNAMENT_KEY_PEPPER`
- **Tabelas utilizadas:** `tournaments`, `tournament_edit_secrets`

### 5.2. `send-notification-email`

- **Finalidade:** Envia emails de notificação (desafios de amistoso, novas rodadas do ranking).
- **Arquivos:** `supabase/functions/send-notification-email/index.ts`
- **verify_jwt:** `false` (chamado pelo frontend)
- **Secrets necessários:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (opcional), `SITE_URL`
- **Tabelas utilizadas:** `profiles` (para buscar email do destinatário)

### Como fazer o deploy

1. Instale a CLI do Supabase: `npm install -g supabase`
2. Faça login: `supabase login`
3. Vincule o projeto: `supabase link --project-ref <novo-project-ref>`
4. Faça o deploy: `supabase functions deploy tournament-api` e `supabase functions deploy send-notification-email`

> Alternativamente, use o painel do Supabase: **Edge Functions > Deploy new function** e selecione os arquivos.

---

## 6. Variáveis do frontend

Após a migração, atualize o arquivo `.env` com as credenciais do novo projeto:

### Variáveis públicas (frontend)

| Nome | Descrição |
|------|-----------|
| `VITE_SUPABASE_URL` | URL do novo projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/publishable do novo projeto |

### Variáveis de servidor (NÃO incluir no frontend)

| Nome | Descrição |
|------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role — usada apenas nas Edge Functions |
| `TOURNAMENT_KEY_PEPPER` | Pepper para hash de chaves — usado apenas na Edge Function |
| `RESEND_API_KEY` | Chave da API Resend — usada apenas na Edge Function |
| `SITE_URL` | URL pública do site — usada apenas na Edge Function |

---

## 7. Configuração do Authentication

O projeto utiliza **Supabase Auth com email e senha** (sem provedores sociais, sem magic links).

### Configurações a serem verificadas no novo projeto:

1. **Authentication > Sign In / Up:**
   - Email + Password: **habilitado**
   - Confirm email: **desabilitado** (o sistema não usa confirmação por email)
   - Email template: pode ser customizado, mas não é obrigatório

2. **Authentication > URL Configuration:**
   - Site URL: URL do frontend (ex: `https://tenis-entre-amigos.app`)
   - Redirect URLs: adicione a URL do frontend + `/*`

3. **Criação de perfil automática:**
   - Ao se cadastrar, o frontend chama a RPC `create_own_profile()` que cria a linha em `profiles` com `role = 'player'`.
   - Não é necessário configurar um trigger no Auth, pois o frontend chama a RPC explicitamente após o signup.

4. **Promoção a admin:**
   - Após a migração, o primeiro usuário deve ser promovido a admin manualmente.
   - Execute no SQL Editor: `SELECT set_user_role('<uuid-do-usuario>', 'admin');`

---

## 8. Configuração de Storage

O projeto usa um bucket de Storage:

| Bucket | Público | Finalidade |
|--------|---------|-----------|
| `avatars` | Sim | Fotos de perfil dos usuários |

O script `migration_complete.sql` já cria o bucket e configura as políticas:
- Usuários autenticados podem fazer upload para a sua própria pasta (`avatars/<user_id>/`)
- Usuários autenticados podem atualizar seus próprios avatares
- Qualquer pessoa (anon e authenticated) pode ler avatares

Não é necessária configuração adicional no painel.

---

## 9. Configuração de Realtime

O projeto usa Realtime em 6 tabelas para atualizações em tempo real:

| Tabela | Finalidade |
|--------|-----------|
| `tournaments` | Atualização ao vivo de torneios legado |
| `tournaments_meta` | Status do torneio em tempo real |
| `tournament_group_matches` | Placares das partidas de grupo |
| `tournament_playoff_matches` | Placares do mata-mata |
| `ranking_matches` | Placares das partidas do ranking |
| `ranking_rounds` | Status das rodadas do ranking |

O script `migration_complete.sql` já configura:
- `REPLICA IDENTITY FULL` em todas as tabelas com Realtime
- Adição das tabelas na publication `supabase_realtime`

Não é necessária configuração adicional no painel.

---

## 10. Como testar após a migração

### 10.1. Verificar a estrutura do banco

Execute no SQL Editor:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```
Deve retornar 19 tabelas.

### 10.2. Criar o primeiro usuário admin

1. Acesse a aplicação e faça cadastro com email e senha.
2. Copie o UUID do usuário no SQL Editor:
   ```sql
   SELECT id, email, role FROM profiles;
   ```
3. Promova a admin:
   ```sql
   SELECT set_user_role('<uuid>', 'admin');
   ```

### 10.3. Testar fluxos principais

1. **Login:** Entrar com email e senha.
2. **Painel principal:** Verificar se Últimos Resultados e Tabela do Torneio aparecem lado a lado.
3. **Responsividade:** Redimensionar a janela para simular mobile.
4. **Painel admin:** Verificar se aparecem as áreas de administração.
5. **Iniciar Ranking:** Clicar e confirmar que o status muda para ativo.
6. **Inscrever-se no Ranking:** Entrar como jogador e verificar se o botão aparece.
7. **Aprovar inscrição:** Como admin, aceitar a inscrição do jogador.
8. **Amistosos:** Criar um novo amistoso e confirmar que funciona.
9. **Torneio:** Criar um torneio, inscrever jogadores, sortear grupos, lançar resultados.
10. **Notificações:** Verificar se as notificações aparechem no sino.

### 10.4. Verificar Edge Functions

```bash
# Testar tournament-api
curl https://<novo-projeto>.supabase.co/functions/v1/tournament-api

# Testar send-notification-email
curl -X POST https://<novo-projeto>.supabase.co/functions/v1/send-notification-email \
  -H "Content-Type: application/json" \
  -d '{"type":"friendly_challenge","recipientId":"<uuid>"}'
```

---

## 11. Pontos de atenção

### 11.1. O que NÃO é reproduzido automaticamente

- **Usuários do Auth:** O script cria a tabela `profiles` que referencia `auth.users`, mas os usuários em si precisam ser criados via signup na aplicação (ou importados manualmente).
- **Dados existentes:** O script não migra dados — apenas a estrutura.
- **Configurações do Auth:** Confirmação de email, templates de email e URLs de redirect precisam ser configurados manualmente no painel.
- **TOURNAMENT_KEY_PEPPER:** Se o valor for diferente do projeto original, as chaves de edição dos torneios legado (`tournaments`) não funcionarão. Mas como não estamos migrando dados, isso não é problema.

### 11.2. Ordem de execução

O script `migration_complete.sql` foi projetado para ser executado em uma única passada. Todas as dependências foram ordenadas corretamente:
1. Extensão → Tabelas → Índices → View → Funções → Triggers → RLS → Permissões → Realtime → Storage → Dados iniciais

### 11.3. Funções com SECURITY DEFINER

O projeto usa extensivamente funções SECURITY DEFINER para operações privilegiadas. O script já inclui todos os REVOKE de PUBLIC/anon e GRANT para authenticated. A função `advance_playoff_bracket` é interna (não acessível nem por authenticated — apenas chamada por `save_match_result` e `save_tournament_match_result`).

### 11.4. Verificação de admin via JWT

As funções `reset_tournament`, `reset_ranking`, `delete_player`, `create_notification` e `generate_ranking_playoffs` verificam admin via `auth.jwt() -> 'raw_app_meta_data' ->> 'role'`. Isso requer que o role do usuário esteja armazenado em `raw_app_meta_data` no JWT. O Supabase faz isso automaticamente quando o role é definido na tabela `profiles` e lido via uma claim customizada.

Se o novo projeto não tiver isso configurado, pode ser necessário criar uma função trigger que atualiza `raw_app_meta_data` no `auth.users` quando o role muda em `profiles`. Verifique se o `set_user_role` funciona corretamente após a migração.

---

## 12. Resumo dos arquivos

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migration_complete.sql` | Script SQL completo para recriar todo o banco |
| `supabase/MIGRATION_GUIDE.md` | Este guia |
| `supabase/functions/tournament-api/` | Edge Function para API de torneios |
| `supabase/functions/send-notification-email/` | Edge Function para envio de emails |
| `supabase/config.toml` | Configuração das Edge Functions (verify_jwt) |
