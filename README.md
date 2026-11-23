# EcoSense / EcoSenseMonitor Web

## Endereços

- **Institucional (provisório):** https://ecosensemonitor.github.io/institucional/
- **Plataforma:** https://ecosensemonitor.github.io/
- **Organização GitHub:** https://github.com/EcoSenseMonitor

O site institucional poderá ser migrado para `ecosense.github.io` quando a outra organização e o repositório existirem.

## Situação da entrega

- Site institucional com tecnologia, projeto, arquitetura, funcionamento e quadro de indicadores operacionais.
- Aplicativo web 3.5.7 com navegação, gráficos, mapa e análises preexistentes.
- Formulários de **login**, **cadastro**, **recuperação de senha**, **logout** e verificação de aprovação.
- Contas ainda **não ativas**: falta conectar um projeto Supabase.
- Backend da telemetria ainda **não conectado**: `app/config.js` mantém `ECOSENSE_API_URL` vazio.
- Indicadores operacionais públicos permanecem como indisponíveis até existir API pública agregada.

## Configurar autenticação real (Supabase)

1. Crie um projeto no https://supabase.com/dashboard.
2. Em **Authentication → Providers**, habilite email/senha e confirmação de e-mail.
3. Em **Authentication → URL Configuration**, defina Site URL `https://ecosensemonitor.github.io` e Redirect URLs correspondentes.
4. No SQL Editor do projeto, execute todo o arquivo [infra/supabase-auth.sql](infra/supabase-auth.sql). Isso cria a tabela `profiles`, ativa **Row Level Security** e registra contas novas como **não aprovadas**.
5. Em **Project Settings → API**, copie a *Project URL* e a chave **publishable/anon** (nunca a chave `service_role`).
6. Atualize `app/config.js`, preenchendo `ECOSENSE_SUPABASE_URL` e `ECOSENSE_SUPABASE_ANON_KEY`. As duas variáveis são próprias do frontend e públicas.
7. Cadastre a conta de administrador pelo formulário, confirme o e-mail e localize o UUID em **Authentication → Users**. No SQL Editor, após verificar o usuário, execute:
   ```sql
   update public.profiles
   set approved = true, role = 'admin'
   where user_id = 'UUID-DO-USUARIO-CONFERIDO';
   ```
8. Contas novas continuarão pendentes até a aprovação administrativa. Isso impede acesso imediato de desconhecidos.

## Segurança essencial

O GitHub Pages é **estático**: não protege arquivos HTML/CSS/JS contra visualização pública. O bloqueio de interface só é uma camada de UX; dados privados devem ser protegidos pelo **servidor**.

- O Apps Script anterior tem um endpoint público no JavaScript legado. Restringir esse endpoint e implementar validação de JWT no serviço de telemetria é obrigatório antes de confiar na restrição de dados.
- O backend deve validar a identidade e a autorização em cada requisição. Não confie em parâmetros `role` ou `approved` passados pelo navegador.
- Nunca publique senhas, chaves AWS, service_role, tokens ou credenciais do Apps Script no repositório.
- O frontend não tem autorização para aprovar suas próprias contas: apenas administrador no backend/SQL Editor.
- O SQL publicado contém apenas esquema, sem segredos.
- Não interprete a existência do login como segurança completa do backend: esta etapa permanece pendente.

## Dados operacionais do site institucional

Para exibir números públicos verificados, disponibilize uma API agregada com o JSON:

```json
{
  "stations_total": 1,
  "stations_online": 1,
  "readings_total": 10000,
  "updated_at": "2026-11-23T12:00:00Z"
}
```

Os números acima são **somente formato de exemplo**, não medições reais. O endpoint deve aplicar CORS autorizado, sanitização e política para dados públicos. Configure seu endereço em `window.ECOSENSE_PUBLIC_STATUS_URL` no arquivo `app/config.js`.

## Telemetria

Para acesso realmente restrito, implante API/banco persistentes e faça todas as consultas, cadastros e alterações verificarem JWT do Supabase e as permissões do usuário. Hoje a versão antiga do front utiliza armazenamento no navegador; sincronização multiusuário central não está concluída.

## Publicação

Repositório: `EcoSenseMonitor/ecosensemonitor.github.io`, branch `main`, pasta `/(root)`. GitHub Pages publica automaticamente as alterações conforme o fluxo configurado.

> Não inserir dados pessoais reais ou credenciais nos issues públicos.
