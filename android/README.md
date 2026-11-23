# CampoData Offline — Android (APK)

Aplicativo Android nativo para coleta do Questionário Semiestruturado — Percepção Socioambiental (52 questões, 11 blocos). O APK inclui HTML, CSS, JavaScript e o questionário no pacote. Ele não necessita de internet ou GitHub Pages para abrir ou responder.

## Redundância

- Camada principal: IndexedDB no Android WebView.
- Camada secundária: arquivos JSON individuais nos arquivos privados do APK (pasta entrevistas-espelho), gravados a cada edição e após o commit do IndexedDB. Na abertura, a cópia mais recente pode recuperar registros ausentes/desatualizados.
- Camada externa: exportação manual de backup JSON pelo seletor de arquivos do Android. Recomenda-se guardar fora do dispositivo.
- O PWA e o APK são instalações independentes: não compartilham dados automaticamente. Para migrar, exporte o JSON no primeiro e importe no segundo.

## Compilação

O workflow .github/workflows/campodata-android.yml gera o APK de teste no GitHub Actions e disponibiliza o arquivo em Artifacts. Os arquivos web são copiados de campodata/ no momento do build.

Compilação local exige Android SDK 35, JDK 17 e Gradle 8.9. Antes de compilar, copie index.html, app.js, style.css, questionario.json, manifest.webmanifest e icon.svg de campodata/ para android/app/src/main/assets/www/. Entre em android/ e execute gradle :app:assembleDebug.

## Cuidados

Este APK de teste é assinado por uma chave de debug gerada no ambiente de compilação. Builds futuros podem usar outra assinatura e não instalar por cima do anterior. **Não desinstale com entrevistas sem backup.** Para distribuição contínua é necessário certificado de assinatura de produção estável, gerenciado fora do repositório. Não publique chaves privadas no GitHub.

Antes de coletar dados reais, teste em um Android físico: abrir, iniciar entrevista, ativar modo avião, fechar à força, reabrir, recuperar rascunho, concluir, exportar e importar backup.

O app armazena nomes de entrevistados: confira TCLE/protocolo ético e proteja o aparelho com senha/biometria. Os arquivos de backup JSON não são criptografados. Não há sincronização automática. O APK não solicita permissão de internet. GPS e seleção de arquivos requerem permissões do Android.
