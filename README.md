# EcoSenseMonitor — implantação operacional

- [Aplicativo com login](https://ecosensemonitor.github.io/)
- [Site institucional](https://ecosensemonitor.github.io/institucional/)
- [Supabase](https://supabase.com/dashboard/project/wntqtnssnznqwpsuemja)

## Estado verificado em 23/11/2026

- Projeto Supabase na região São Paulo, plano inicialmente cotado a US$ 0/mês.
- Auth: login e cadastro por email/senha, recuperação de senha, verificação de perfil e ativação única do primeiro administrador.
- Cadastro de usuários pendente de aprovação, com tabela de perfis protegida por RLS.
- Tabelas `stations`, `readings`, `ingestion_state`, `ingestion_settings`, `admin_bootstrap` com controles de acesso.
- Importador server-side `import-readings` ativo, vinculado à estação de referência `estacao-01` (endpoint Google Apps Script real).
- Tarefa `cron.job` ativa: durante a importação histórica a função processa lotes; após o histórico completo, o acionamento é periódico a cada 10 min.
- Importação real confirmada: primeiro lote de 500 registros, HTTP 200, sem dados demonstrativos.
- API `public-stats` ativa, devolvendo contagens agregadas sem expor dados individuais.
- Ações de cadastro, atualização e exclusão de estações no Supabase são exclusivas de administradores.
- Históricos e arquivos de usuário são acessados somente por usuários aprovados. A interface visualiza até 1500 leituras recentes/estação; exportação integral paginada consulta diretamente o banco.

## Primeiro acesso (única ação pessoal obrigatória)

1. Em [Authentication → URL Configuration](https://supabase.com/dashboard/project/wntqtnssnznqwpsuemja/auth/url-configuration), definir **Site URL** `https://ecosensemonitor.github.io` e permitir redirecionamentos `https://ecosensemonitor.github.io/**`.
2. Em [Authentication → Providers](https://supabase.com/dashboard/project/wntqtnssnznqwpsuemja/auth/providers), habilitar Email com confirmação de endereço.
3. No [site](https://ecosensemonitor.github.io/), clicar em **Criar conta** e informar seu e-mail real. Confirmar e-mail e retornar ao site para fazer login.
4. Quando aparecer **Ativar administrador**, colar o código de ativação privada fornecido ao proprietário. O código não está neste repositório, é de uso único e expira em 30 dias após a geração.
5. Depois disso, a área Administração libera aprovação de novos usuários, estações e importação manual.

## Avisos de segurança

- **Nunca** inserir credenciais `service_role`, senhas, SMTP ou tokens privados em `app/config.js` ou GitHub.
- A chave `sb_publishable_*` usada no navegador é pública por natureza. A proteção real são os JWTs, as políticas RLS e a validação administrativa no servidor.
- O GitHub Pages é público e estático: a proteção cobre as contas e os dados armazenados no Supabase, não a visualização dos arquivos HTML/JS/CSS.
- O endpoint legado do Google Apps Script é externo e pode ter suas próprias regras públicas de acesso; para restringir a origem, alterar a implantação e autorizações no Google Apps Script, separadamente.
- O login completo com e-mail real só poderá ser testado após criar e confirmar uma conta.
- A estação foi cadastrada sem coordenadas manuais: coordenadas são obtidas exclusivamente dos dados reais quando disponíveis.
- A tabela `readings` preserva o horário UTC; a interface exibe datas em America/Fortaleza.

## Arquivos

- `index.html`, `app/index.html`: áreas de acesso.
- `app/auth.js`, `app/auth.css`: autenticação e ativação.
- `app/app.js`, `app/cloud.js`: dashboard e integração persistente com Supabase.
- `institucional/index.html`: página institucional com estatísticas em tempo real quando a API responde.
- `app/config.js`: URLs e chave publicável.
- `infra/supabase-auth.sql`: exemplo da primeira estrutura do banco; **não reexecutar indiscriminadamente**, pois a estrutura real possui migrações posteriores no Supabase.
