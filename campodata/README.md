# CampoData — coleta científica offline

Aplicativo PWA para Android, iPhone e iPad. Inclui o questionário semiestruturado de percepção socioambiental com 52 perguntas e 11 blocos. A versão Android APK inclui os arquivos no próprio instalador.

## Gerenciar formulários (novo)

Acesse **Gerenciar formulários** no menu. É possível:

- Criar um formulário com título e descrição, adicionar blocos e perguntas;
- Escolher texto curto/longo, número, resposta única, múltipla, Sim/Não, escala 1–5+NS, data, horário, coordenadas GPS ou fotografia;
- Marcar respostas obrigatórias e definir alternativas (uma por linha);
- Duplicar qualquer formulário, inclusive o questionário original;
- Editar, reordenar e excluir perguntas/blocos de formulários personalizados;
- Aplicar o formulário em **Nova entrevista**, selecionando o modelo desejado;
- Salvar as alterações offline; recuperar uma edição não salva quando disponível.

O questionário original é protegido contra edição direta: use **Duplicar** para fazer alterações. Cada entrevista salva uma cópia da versão do formulário usada na criação, de modo que edições posteriores não alterem suas perguntas. O campo de código e horários é automático; a conclusão requer o nome e a confirmação do TCLE, além de eventuais questões marcadas como obrigatórias.

## Coleta e exportações

Dados persistem em IndexedDB (banco do navegador ou WebView). No Android há uma cópia espelho dos registros; no APK também são armazenados arquivos espelho privados dos formulários. No Android PWA, o espelho do questionário usa localStorage.

A tela **Dados e backup** oferece:

- **CSV**: uma linha por entrevista, com colunas de cada formulário para análise em Excel e R;
- **Excel XLSX**: planilha gerada offline, sem enviar respostas para servidor;
- **Backup JSON**: inclui fichas, fotos e formulários personalizados; pode ser restaurado em outro aparelho.

PWA e APK são instalações separadas e não compartilham banco automaticamente. Faça transferência via JSON. Um arquivo CSV/XLSX não substitui o backup JSON completo, pois fotografias e estruturas de questionários precisam ser preservadas.

## Segurança e limitação

O nome do entrevistado é dado pessoal. O questionário original orienta manter nomes apenas no TCLE; confirme se a inclusão no app foi aprovada pelo protocolo/consentimento. Os backups JSON não são criptografados. Guarde em local seguro. Não desinstale nem limpe dados do navegador sem exportar e conferir o backup.

Verifique o uso offline em aparelho físico antes do trabalho: com internet, abra e instale; em modo avião, feche à força, reabra, continue rascunho, conclua e faça backup. Não há sincronização automática. O espelho local não protege contra perda ou defeito do dispositivo.

## Atualização do APK

O workflow GitHub Actions compila um APK de teste, normalmente com assinatura de debug diferente de compilações anteriores. Para atualizar pode ser necessário desinstalar uma versão anterior: **exporte o backup JSON antes e não desinstale sem verificá-lo**. Para distribuição estável, configure uma chave permanente de assinatura Android fora do repositório.
