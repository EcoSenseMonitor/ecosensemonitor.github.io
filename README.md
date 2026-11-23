# EcoSenseMonitor — plataforma web

Repositório oficial: https://github.com/EcoSenseMonitor/ecosensemonitor.github.io

Endereço previsto de publicação: https://ecosensemonitor.github.io

## Organização
- `index.html`: site institucional provisório e acesso à plataforma.
- `app/index.html`: interface EcoSenseMonitor Web 3.5.7.
- `app/config.js`: endereço da API (atualmente vazio, sem backend conectado).
- `.github/workflows/importar-assets.yml`: rotina de migração dos arquivos públicos do AWS Amplify para o GitHub.

**Status**: o frontend foi enviado; a importação dos arquivos estáticos para independência do Amplify depende da execução bem-sucedida do workflow. A API central para histórico e dados em tempo real ainda precisa ser implantada e configurada. Não se deve confundir site publicado com sincronização concluída.

## Ativar o GitHub Pages
Torne o repositório público se for utilizar o GitHub Free, revise credenciais antes da alteração e configure `Settings → Pages → Deploy from a branch → main → /(root)`.

Os arquivos HTML/CSS/JavaScript são públicos quando o Pages está ativo. Nunca comite chaves, senhas ou tokens.
