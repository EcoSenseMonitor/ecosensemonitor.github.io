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
- Tarefa `cron.job` ativa: o endpoint Google Apps Script atual entrega apenas as últimas 500 leituras e ignora offset/limit; o sistema consulta essa janela a cada 10 minutos, deduplicando no Supabase. O histórico anterior não pode ser recuperado apenas por esse endpoint.
- Importação real confirmada: 500 registros distintos, HTTP 200, sem dados demonstrativos. O histórico completo exige acesso à planilha-fonte original ou uma API com paginação funcional.
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

## Histórico completo importado em 23/11/2026

- Fonte: [Google Sheets — Dados_OK](https://docs.google.com/spreadsheets/d/19nWiwHXIM7fKcLsUcQHPhrXSbHm1yj6OJV8LJuCB-B8/edit), aba `Dados_OK`.
- Linhas de dados verificadas: **260.314**, correspondentes às linhas 2 a 260315.
- Importação `public.sheet_readings`: **260.314 linhas**, sem lacunas de identificador; início `2026-04-14 20:48:47 UTC` e último registro `2026-11-20 02:33:05 UTC` (19/11 no horário local).
- Todas as 43 colunas originais preservadas no JSON `raw_values`, indexadas por `source_row`.
- `public.timeline_readings`: reúne histórico integral da planilha com leituras posteriores recebidas pela API legada, sem reapresentar as já importadas.
- `public.history_chart`: agregação no servidor por faixa temporal; 1000 intervalos no pedido padrão, preservando a contagem original por intervalo.
- `public.history_summary`: indicadores de todo o período, incluindo mínimo, máximo e médias por variável quando disponível.
- Nova aba do aplicativo **Histórico integral**, com filtros de datas, paginação de 100 registros, detalhes dos 43 campos e exportação CSV paginada.
- `public-stats`: confirmou HTTP 200, 260.314 registros, uma estação e zero estações com leituras recentes em 23/11/2026.
- A consulta ao Apps Script com `ultimos=true&limit=500` funciona e o coletor é acionado pelo cron a cada 10 minutos. O backend mantém as novas leituras em `public.readings`, incorporando-as à linha do tempo quando posteriores ao último timestamp da planilha importada.
- **Atenção:** o último registro da planilha é de 19/11/2026 à noite, não de 23/11. Não inventar telemetria em tempo real; investigar transmissão da estação se não houver leituras novas.
- A nova versão de Apps Script fornecida pelo proprietário tem paginação histórica, mas não há confirmação de implantação atualizada no Google; como o histórico já foi copiado diretamente da planilha, a consulta `ultimos=true` atende à atualização incremental da estação existente.


## Política de permissões definida pelo proprietário (23/11/2026)

**Regra de produto a implementar e testar na API, banco e interface (não presumir que já está aplicada):**

- **Administrador único:** conta identificada por `jose.mpa@discente.ufma.br`, sujeita à verificação de identidade e permissões no servidor. Não atribuir `admin` a nenhuma outra conta por cadastro, autoatendimento ou metadados alteráveis pelo usuário.
- **Viewer:** usuário aprovado somente para consultar dados, mapas, históricos e análises disponibilizados conforme as regras de acesso. Não cadastrar, modificar, excluir ou comandar estações; não acessar credenciais privadas.
- **Cliente / Colaborador:** usuários promovidos mediante autorização administrativa, autorizados a cadastrar e gerenciar **somente estações próprias ou atribuídas explicitamente**, inclusive comandos operacionalmente permitidos e auditados.
- **Administrador:** aprovar contas, conceder/revogar papéis, gerenciar todas as estações, integrações globais e políticas.
- **Segredos e integrações:** chaves administrativas nunca devem ser retornadas ao navegador nem registradas em arquivos públicos. Operações usam backend protegido com credenciais mantidas no servidor. Eventuais credenciais individuais de dispositivos devem ser isoladas por titular.
- **Garantias técnicas necessárias:** papéis definidos em fontes não editáveis pelo usuário, relações de propriedade de estações, autorização por estação em toda API e política RLS, comandos auditáveis e verificações em testes com perfis distintos. Esconder botões não é controle de acesso.
- **Estado em 23/11/2026:** esquema original de `profiles.role` possui `viewer`, `operator`, `admin`; `stations` não tem `owner_user_id`. Portanto, esta política **ainda requer implementação** e não deve ser declarada plenamente aplicada.

## Controle de acesso — implantação de 23/11/2026

O esquema ativo do Supabase foi migrado para os papéis `viewer`, `client`, `collaborator` e `admin`, com um índice único para impedir dois administradores aprovados. A conta administradora confirmada é `jose.mpa@discente.ufma.br`. A função `approve_user` não permite promover outro usuário a `admin`, e a ativação inicial por código foi desabilitada após existir um administrador.

A tabela `stations` contém `owner_user_id`; clientes e colaboradores podem inserir, alterar e excluir somente estações que lhes pertencem, segundo políticas RLS. A tabela `readings` permite upload de dados somente para estações próprias ou ao administrador. A leitura de estações e medições continua disponível aos usuários aprovados. A coluna `source_url` foi retirada das permissões SELECT dos usuários autenticados.

Os menus da aplicação em `app/auth.js` e `app/cloud.js` foram filtrados por papel: viewer visualiza dashboard, mapa, análises, histórico e preferências; client/collaborator acrescentam gerenciamento de estações próprias; admin possui administração, integrações e logs. A autorização efetiva das operações permanece no banco.

`station_commands` registra solicitações auditadas com permissão por proprietário e ações controladas (`sample_now`, `restart`, `set_interval`). **Não há gateway de execução de comandos instalado no firmware**, portanto `pending` é apenas pedido registrado — não confirma execução física. Não representar comandos como executados até haver canal autenticado, confirmação do dispositivo e rotina de atualização do status.

Testes SQL concluídos: usuário sem identidade não lê estações; administrador validado consegue consultar a estação existente; somente um administrador aprovado. Testes end-to-end com contas reais distintas (viewer, client, collaborator) e firmware permanecem pendentes.
