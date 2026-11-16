# Dance Tonight · Plano de 100 Dias de Abdômen e Queima de Gordura (Desktop)

[![CI](https://github.com/aicccode/dance-tonight/actions/workflows/ci.yml/badge.svg)](https://github.com/aicccode/dance-tonight/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/aicccode/dance-tonight?sort=semver)](https://github.com/aicccode/dance-tonight/releases/latest) [![License](https://img.shields.io/github/license/aicccode/dance-tonight)](https://github.com/aicccode/dance-tonight/blob/main/LICENSE) [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-4a5568)](https://github.com/aicccode/dance-tonight/releases/latest)

Um jogo fitness em que você se exercita no ritmo da música, e também uma ferramenta de aprendizado de dança em 3D. Os movimentos fitness são avaliados pela câmera quanto à execução correta e pontuados por precisão e ritmo; nas danças complexas, o foco é observar a treinadora, aprender os passos e acompanhar a coreografia até o fim. A treinadora VRM na tela demonstra os movimentos continuamente e avisa por voz qual é o próximo.

Suporta Windows, macOS e Linux. Tudo roda localmente, sem servidor — as imagens da câmera nunca saem do seu computador.

| ![Modo de dança: seguindo um clipe de captura de movimento importado](screenshot-dance.png) | ![Treino de hoje: plano de 100 dias, registro corporal e estatísticas](screenshot-home.png) |
|---|---|
| Modo de dança: seguindo um clipe de captura de movimento importado | Treino de hoje: plano de 100 dias, registro corporal e estatísticas |

## Funcionalidades

| Modo | Descrição |
|---|---|
| **Treino de hoje** | Escolhe músicas automaticamente conforme o plano de 100 dias até completar a duração do dia. A densidade e a variedade dos movimentos aumentam gradualmente com os dias; a cada 7 dias é um dia de recuperação |
| **Desafio de velocidade** | Para músicas rápidas acima de 125 BPM (DJ etc.). Um movimento por batida, com pontuação por barra de vida: PERFECT +3, GREAT +1, GOOD −4, MISS −14; se a barra esvaziar, o desafio falhou. É possível ativar aceleração progressiva; cada música tem seu próprio ranking |
| **Escola de movimentos** | Pratique um movimento por vez. A treinadora demonstra em loop, com barra de correspondência em tempo real e contador de repetições na tela |
| **Dança moderna guiada** | Treinadora 3D movida por captura de movimento real: importe arquivos de motion capture Mixamo FBX / BVH / VRMA e aprenda acompanhando. Velocidade de 0,25 a 1×, loop por trechos, espelhamento, arrastar para girar 360° e comparar com a câmera lado a lado |
| **Modo dança** | 27 movimentos de dança/variantes esquerda-direita, quatro coreografias (Starlight Groove / Block Shuffle / Glow Flow / Rotating Stage), cada uma com 4 trechos de 8 tempos. Primeiro treine por partes em velocidade lenta, depois escolha uma música e faça a apresentação completa; movimentos complexos são ensinados em etapas conforme a conclusão, sem depender da detecção de giro 2D |

- **Estimativa de calorias**: calculada por "movimentos realmente acertados × MET do movimento × duração por batida × peso corporal + metabolismo basal" — movimentos errados não contam calorias, muito mais razoável que multiplicar a duração total da música por um fator fixo. A tabela MET está em `web/js/core/moves.js` (`MOVE_MET`) e `web/js/dance/dancemoves.js` (`DANCE_MET`).
- **Abdômen e gordura corporal**: ver o abdômen depende do percentual de gordura; treinar abdômen não queima gordura localizada. Mantenha o treino consistente + registre a circunferência da cintura; uma razão cintura/altura abaixo de 0,5 é um sinal de progresso mais confiável que o peso (o gráfico de tendências da página inicial agora mostra peso e cintura juntos).
- **Movimentos de dança**: os básicos incluem disco, palmas, coração com as mãos, Vogue, balanço de braços, rebolado de quadril, dab e bounce; os avançados incluem body wave/roll, arm wave, chest pop, shoulder roll, passo lateral, passo cruzado, giro de 360° para cada lado e back body wave. Os movimentos avançados usam keyframes contínuos de várias batidas, passam de verdade pela frente, pelo lado e por trás, e incluem deslocamento de peso frente/trás; durante a prática aparecem dicas etapa por etapa e o progresso da demonstração, sem exigir que a câmera reconheça as costas.
- **Treinadora 3D**: usa um avatar VRM e demonstra espelhado (você levanta a perna esquerda, ela levanta a direita — como num espelho), acertando exatamente o ponto da batida. A janela da treinadora pode ser arrastada e redimensionada, e a posição é lembrada. Nas combos ela sorri.
- **Treinadora de voz**: os 10 idiomas da interface já vêm com pacotes de voz offline embutidos, prontos para usar:
  - O chinês traz a voz CosyVoice integrada "Longhua" (longhua_v3.1); os outros 9 idiomas (inglês / espanhol / russo / japonês / coreano / francês / alemão / português / árabe) são gerados com as vozes neurais da Microsoft Edge — uma voz feminina única, com qualidade comparável ao chinês. Todos os pacotes são distribuídos com o repositório, prontos para usar;
  - Os pacotes de voz ficam em `assets/tts/`: `longhua_v3.1@zh/` para o chinês e `edge@<idioma>/` para os demais idiomas; nas Configurações, o pacote do idioma da interface pode ser substituído pelas suas próprias gravações;
  - Contagem regressiva "três, dois, um" no início; no começo de cada série, um aviso como "elevar os joelhos alternando esquerda e direita";
  - Cada frase termina antes do ponto da batida, e a música abaixa automaticamente enquanto ela fala;
  - Ela dá incentivos no meio do treino, como "já foi metade" ou "combo sem quebrar"; no modo dança, cada movimento é anunciado pelo nome ("dedo ao céu esquerdo", "balanço de braços à esquerda"…).
- Os textos das falas ficam em `web/js/core/cue_texts.js`; os 9 pacotes não chineses podem ser regenerados com `python3 scripts/gen_voices_edge.py` (completa automaticamente apenas os que faltam). Você também pode enviar suas próprias gravações nas Configurações para substituir a voz do idioma atual.
- **Modo às cegas**: cada movimento é anunciado com "esquerda" ou "direita", e há um som de aviso nos pontos da batida. Dá para treinar de fones no ouvido e de olhos fechados.
- **Análise de batidas**: traz embutido o Beat This! (modelo de detecção de batidas do ISMIR 2024, quantizado em int8, 22 MB), executado em um worker em segundo plano, cerca de 8 segundos por música. Em 49 músicas de teste:
  - o tempo foi identificado corretamente em 48 (o librosa acertou apenas cerca da metade; músicas lentas eram frequentemente detectadas no dobro do tempo);
  - a concordância das posições das batidas com o modelo PyTorch original foi F = 0,995.
  - Se o carregamento do modelo falhar, o app passa automaticamente ao algoritmo de batidas em JS puro embutido.

- **Música online**: pesquise faixas royalty-free na própria biblioteca (Openverse, que agrega Freesound, Jamendo, Wikimedia Commons e mais, sem conta). Só retorna licenças de uso comercial (CC0 / CC-BY / CC-BY-SA); ouça, importe com um clique e a análise de batida começa sozinha.

## Movimentos

**Movimentos fitness** (por nível de desbloqueio):

| Nível | Movimento | Foco principal |
|---|---|---|
| 1 | 🙌 Braços para cima · 👊 Soco esquerdo/direito | Aeróbico, ombros |
| 1 | 🍑 Agachamento | Pernas e glúteos (a profundidade é avaliada pelo ângulo do joelho) |
| 1 | 🦵 Elevação de joelho esquerda/direita · 🤸 Toque nos pés | Abdômen, cadeia posterior |
| 2 | ⭐ Polichinelo | Aeróbico |
| 2 | ✖️ Joelho esquerdo no cotovelo direito / joelho direito no cotovelo esquerdo | Oblíquos |
| 2 | 🦵 Elevação lateral de joelho esquerda/direita · 🦶 Chute frontal esquerdo/direito | Oblíquos, glúteos, estabilidade do core |
| 3 | 🌙 Flexão lateral esquerda/direita (pode manter) | Abdômen lateral |

**Movimentos de dança** (27 movimentos/variantes esquerda-direita): dedo ao céu disco, palmas no peito, coração com as duas mãos, pose fashion, balanço de braços esquerda/direita, rebolado de quadril, dab, groove de bounce, além de body wave, body roll, arm wave esquerda/direita, chest pop, shoulder roll, passo lateral esquerdo/direito, passo cruzado esquerdo/direito, giro esquerdo/direito e back body wave.

Para aprender mais jazz/dança moderna: pesquise Jazz / Contemporary / Dance no [Mixamo](https://www.mixamo.com/), baixe com formato **FBX Binary** e Skin **Without Skin** e importe em "Dança → Importar arquivo de motion capture" (dá para selecionar dezenas de arquivos de uma vez; a conversão é feita um por um, e arquivos corrompidos são listados separadamente sem afetar os demais). Na importação, os esqueletos são reconhecidos automaticamente (Mixamo, CMU, BVH comuns, VRMA), eixos e orientação corrigidos, diferenças de pose A/T alinhadas, tremores da captura suavizados e trechos parados no início e no fim removidos; os dados convertidos ficam salvos em `dances/` no diretório de dados local.

**Coreografia própria**: em "Dança → Minhas coreografias → Nova coreografia", arraste movimentos da biblioteca à direita para a sequência (arrastando entre dois movimentos, insere ali) ou clique em um movimento para adicioná-lo depois do selecionado; os movimentos da sequência podem ser reordenados arrastando, excluídos com Delete e espelhados esquerda/direita com um clique. Cada movimento ocupa tempo conforme sua própria duração: movimentos normais, 1 tempo; giros/waves conforme suas batidas próprias; motion capture (importado e dança moderna embutida) toca o trecho inteiro em velocidade original, e o próximo movimento começa na batida seguinte. Na apresentação, escolha uma música e dance do primeiro ao último movimento (a música faz fade-out junto); a prática por trechos divide automaticamente a sequência em blocos de cerca de 8 tempos. As coreografias embutidas podem ser "copiadas e adaptadas" como ponto de partida. As coreografias ficam salvas em `data/data.json` no diretório de dados.

**Coreografias avançadas**: "Glow Flow" enfatiza linhas do corpo, arm wave e isolamento de peito/ombros; "Rotating Stage" enfatiza passos laterais, giros completos e combinações de costas. Movimentos de várias batidas são demonstrados por completos em 2 ou 4 batidas, sem trocar no meio da animação.

## Download e instalação

Sem programar: baixe o instalador da sua plataforma em [Releases](https://github.com/aicccode/dance-tonight/releases/latest). Bastam dois cliques — sem conta, sem ativação online.

| Plataforma | Arquivo | Como instalar |
|---|---|---|
| Windows 10 / 11 (x64) | `Dance.Tonight.Setup.*.exe` | Execute. Na primeira vez o SmartScreen mostra "Editor desconhecido": clique em "Mais informações → Executar mesmo assim" |
| macOS (chip Apple) | `Dance.Tonight-*-arm64.dmg` | Arraste o ícone para "Aplicativos"; não é notarizado, então na primeira vez use botão direito → Abrir |
| macOS (Intel) | `Dance.Tonight-*.dmg` | Igual ao acima |
| Linux (x64) | `Dance.Tonight-*.AppImage` | `chmod +x` e execute; se faltar FUSE, instale `libfuse2` |

O app não tem certificado de assinatura de código, então Windows e macOS avisam sobre um desenvolvedor desconhecido. Todo o código está neste repositório — confira ou compile conforme a próxima seção.

## Executar a partir do código-fonte (vale para as três plataformas)

Requer Node.js 20 ou superior.

```bash
npm install      # dependências via npmmirror (ver .npmrc); ao concluir, copia MediaPipe/three.js/onnxruntime para web/vendor automaticamente
npm start
```

`web/vendor/` é gerado e não versionado: `scripts/vendor.mjs` recria a pasta após `npm install`, copiando as bibliotecas de `node_modules` e o modelo de pose de `assets/models/`. Nada é baixado durante a instalação.

O diretório `assets/` guarda os recursos embutidos, que acompanham o pacote na build. O repositório inclui apenas o **pacote mínimo de verificação** (recursos grandes/pessoais não entram no repositório):

| Caminho | Conteúdo |
|---|---|
| `assets/models/beat_this_final0.int8.onnx` | modelo de batidas (Beat This! int8, MIT, ver NOTICE) |
| `assets/avatars/RealMaster.vrm` `SportGirl.vrm` | avatares de treinadora embutidos (licença de cada modelo ver NOTICE) |
| `assets/dances/*.json` | 3 danças de motion capture embutidas |
| `assets/tts/longhua_v3.1@zh/` `edge@<idioma>/` | pacotes de voz offline para os 10 idiomas, distribuídos com o repositório; podem ser substituídos pelas suas próprias gravações nas Configurações |
| `assets/music/*.mp3` | Duas faixas incluídas (CC BY 3.0, créditos em `assets/music/CREDITS.md`), copiadas para a biblioteca e analisadas no primeiro início — o app funciona offline, já que a busca online depende do Openverse, inacessível em algumas redes |

**Fluxo de verificação mínima**: `npm install && npm start` → biblioteca de músicas → as duas faixas incluídas já estão analisadas; as suas entram por «adicionar arquivo» → iniciar o treino na página inicial; ou vá direto à página "Dança" e acompanhe as danças de motion capture embutidas.

**Mais recursos**:
- Avatares VRM: baixe no [VRoid Hub](https://hub.vroid.com/) o avatar que quiser (atenção aos termos de licença de cada modelo) e importe em "Configurações → Avatar da treinadora";
- Arquivos de motion capture: a página "Dança" do app tem entrada para o [Mixamo](https://www.mixamo.com/), baixe com **FBX Binary + Without Skin** e importe em lote;
- Músicas: importe você mesmo; conteúdo idêntico é guardado em uma única cópia.

## Migração de dados entre dispositivos

O app não se conecta à internet nem exige cadastro; todos os dados ficam no seu computador. Para levar os dados a outro dispositivo, use "Configurações → Dados → Exportar pacote de dados" e gere um arquivo `.dtx`: seleção por categoria (treinos / peso e cintura / minhas coreografias / captura de movimento importada / cópias de músicas / análise de batidas / configurações), compressão gzip e criptografia SM9 (modo SM4). A chave é derivada apenas da frase-senha (mínimo 8 caracteres); a frase não é gravada no arquivo nem enviada a lugar nenhum. A importação é incremental: o conteúdo é deduplicado, o que já existe é mantido e só o que falta é acrescentado. Pacotes exportados por versões antigas com «conta + frase-senha» continuam importáveis.

## Licença de código aberto

Apache License 2.0 (ver [LICENSE](../LICENSE)). As licenças de modelos e recursos de terceiros estão detalhadas item por item no [NOTICE](../NOTICE) — atenção especial aos termos de licença de cada modelo VRM em `assets/avatars/`; confirme antes de distribuir publicamente ou usar comercialmente.

## Empacotamento

| Plataforma | Comando | Resultado |
|---|---|---|
| Linux | `npm run dist:linux` | `dist/Dance Tonight-x.y.z.AppImage` |
| Windows (no Windows) | `npm run dist:win` | instalador NSIS |
| Windows (cross-build no Linux) | `npm run dist:win-cross` | versão portátil em zip, execute `Dance Tonight.exe` após descompactar |
| macOS (precisa estar num Mac) | `npm run dist:mac` | dmg (arm64 + x64) |

A versão macOS não usa certificado de desenvolvedor, apenas assinatura ad-hoc. No primeiro acesso, clique com o botão direito em "Abrir"; se aparecer que o app "está corrompido", execute `xattr -cr "/Applications/Dance Tonight.app"`. Além disso, é preciso autorizar o uso da câmera em "Ajustes do Sistema → Privacidade e Segurança → Câmera".

## Primeiro uso

1. **Biblioteca de músicas → Adicionar pasta inteira**: escolha seu diretório de música; a análise de batidas começa em segundo plano. A música é copiada para o diretório de dados do app (conteúdo idêntico, uma única cópia), e os arquivos originais podem depois ser excluídos ou movidos. Músicas importadas antes serão recopiadas automaticamente na inicialização.
2. Para migrar de uma versão anterior: **Configurações → Dados** tem «Importar dados antigos» (`legacy.json`: treinos, peso, data de início do plano, sem duplicados) e «Importar pacote de análises de batidas» (`beat_pack.json`: emparelhado pela impressão do conteúdo, essas músicas não são reanalisadas).
3. Quer usar a sua voz? Em **Configurações → Treinadora de voz**, envie gravações com o nome do texto de cada fala para substituir a voz do idioma atual, ou restaure o pacote integrado com um clique.
4. Passe primeiro pela **Escola de movimentos** praticando cada movimento, depois volte à página inicial e comece o treino.

Dica de posicionamento: fique a 2,5–3 metros da câmera, com o corpo inteiro no quadro (incluindo os tornozelos) e a luz vindo da frente. Antes de cada música, fique em pé, reto, com os braços relaxados por cerca de 1 segundo para concluir a calibração.

| Tecla | Função |
|---|---|
| Espaço | pular calibração / pausar |
| Esc | encerrar esta música |

## Onde os dados ficam salvos

| Sistema | Local |
|---|---|
| Windows | `%APPDATA%\Dance Tonight\` |
| macOS | `~/Library/Application Support/Dance Tonight/` |
| Linux | `~/.config/Dance Tonight/` |

No diretório, `data/data.json` guarda progresso, resultados e peso; `data/analysis/` guarda a análise de batidas de cada música; `music/` guarda as cópias das músicas importadas; e `tts/`, `avatars/` e `dances/` guardam as vozes que você gerou, os avatares importados e as danças de motion capture importadas. Depois de importar, os arquivos originais podem ser excluídos; para backup ou troca de computador, basta copiar o diretório inteiro. Ao excluir uma música na biblioteca, a cópia dela em `music/` também é removida (seus arquivos originais não são tocados).

## Desenvolvimento

```bash
npm test                          # testes unitários e cobertura
python3 scripts/gen_voices_edge.py  # opcional: regenerar os pacotes de voz dos outros 9 idiomas (pip install edge-tts)
npm run test:coach                # 14 movimentos básicos de dança × 3 VRM, juntas reais enviadas ao avaliador
npm run test:motion               # 13 movimentos avançados × 5 fases × 3 VRM, validação com capturas de tela
npm run test:mocap                # danças de motion capture × 3 VRM verificação de render + UI de aprendizado/fluxo de importação
npm run e2e                       # fluxo completo Electron + as duas regressões de treinadora acima
DT_E2E_EXE=dist/linux-unpacked/dance-tonight npm run e2e   # testar o programa empacotado
node e2e/pose_gallery.mjs         # galeria comparativa de todas as poses fitness/dança (movimentos contínuos usam o trecho do meio)
node e2e/coach_motion.mjs /tmp/dt-motion  # tabela de contato dos movimentos em cinco fases
node scripts/eval_beats.mjs <diretório de músicas> <resultado de referência.json> beatthis   # avaliar precisão das batidas
```

Estrutura de diretórios:

| Diretório | Conteúdo |
|---|---|
| `electron/` | processo principal: janelas, protocolo `app://` (isolamento cross-origin, necessário para multithreading WASM), chamadas entre processos, armazenamento JSON local, gestão de pacotes de voz, gestão de VRM |
| `web/js/core/` | catálogo de movimentos, plano de 100 dias, geração de charts, falas de voz. Compartilhado entre o processo principal e a interface |
| `web/js/analysis/` | algoritmo de batidas em JS puro, pré/pós-processamento do Beat This!, worker de análise |
| `web/js/coach/` | treinadora 3D: three.js + three-vrm, além de poses e curvas de tempo |
| `web/js/voice/` | planejamento temporal dos avisos de voz (funções puras) e reprodução via Web Audio |

## Limitações conhecidas

- Os limiares de avaliação dos movimentos foram testados apenas em poses sintéticas, **ainda não calibrados com pessoas reais**. Se um movimento está sendo executado corretamente mas nunca recebe pontuação cheia, me avise — ou ajuste `MATCHERS` em `web/js/judge.js`.
- A detecção usa apenas a visão frontal 2D e não percebe bem a direção frente/trás do corpo nem movimentos de costas. Por isso, **os movimentos fitness continuam usando poses fáceis de detectar de frente; giros, movimentos de costas e de profundidade são usados apenas no aprendizado guiado de dança**, sem depender de pontuação por correspondência de juntas.
- Os limiares dos movimentos básicos de dança foram calibrados apenas em poses sintéticas; se, dançando de verdade, a pontuação parecer frouxa ou rígida demais, ajuste `DANCE_MATCHERS` em `web/js/dance/dancemoves.js`. Os movimentos avançados guiados consideram a conclusão do acompanhamento e não tratam esse valor como precisão de poses reais de dança.
- As versões Windows e macOS foram empacotadas apenas no Linux até agora e **ainda não foram testadas em máquinas reais**.
