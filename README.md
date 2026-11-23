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
- Backend Supabase e projeto conectados; cadastro depende da configuração das URLs de autenticação, confirmação de e-mail e aprovação administrativa.
- Backend da telemetria ainda **não conectado**: `app/config.js` mantém `ECOSENSE_API_URL` vazio.
- Indicadores operacionais públicos permanecem como indisponíveis até existir API pública agregada.

## Autenticação Supabase — implementada em 23/11/2026

- Projeto criado em São Paulo (`sa-east-1`): `wntqtnssnznqwpsuemja`.
- `app/config.js` já contém **URL** e **chave publishable pública**. Nenhuma chave secreta foi publicada.
- Migration `ecosensemonitor_initial_auth_and_telemetry` aplicada com sucesso.
- Tabelas `profiles`, `stations` e `readings` com RLS e leitura apenas para usuários autorizados.
- A aprovação inicial do administrador é realizada pelo SQL Editor depois de conferir a identidade.

### Primeira conta administrativa

1. Acesse o site e faça o cadastro com um e-mail sob seu controle.
2. Confirme o e-mail, se solicitado.
3. Em [Authentication → Users](https://supabase.com/dashboard/project/wntqtnssnznqwpsuemja/auth/users), copie o **UUID exato da sua conta**.
4. No [SQL Editor](https://supabase.com/dashboard/project/wntqtnssnznqwpsuemja/sql/new), execute:
   ```sql
   update public.profiles
   set approved=true, role='admin'
   where user_id='UUID-CONFERIDO';
   ```
5. Atualize a página e faça login.

**Obrigatório antes de uso público:** Em **Authentication → URL Configuration** defina a Site URL `https://ecosensemonitor.github.io` e a Redirect URL `https://ecosensemonitor.github.io/**`. Confirme as restrições de envio de e-mail/SMTP do plano. Não exponha chaves privadas.

### Dados ambientais

Os registros de telemetria ainda precisam ser importados de fonte verificada e conectados à API protegida. As tabelas estão vazias; não criamos medições artificiais.

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
