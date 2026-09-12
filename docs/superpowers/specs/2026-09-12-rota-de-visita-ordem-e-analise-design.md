# Rota de visita: a melhor ordem, e a análise depois da visita

> Desenho validado com o dono do produto em 12/09/2026. É o **pacote 4** do lote de pedidos de
> 11/09/2026 (ver a memória `pacotes-de-correcoes-11-09-2026`). São duas partes do mesmo módulo:
> **A** — sugerir a melhor ordem das paradas; **B** — trocar a pergunta genérica do fim da visita
> por perguntas específicas, que possam ser enviadas pelo WhatsApp.

## 1. Por que este trabalho existe

Dois pedidos do Lucas:

1. **"Quero que o sistema aponte o caminho mais produtivo."** Quando a ordem montada já for a
   melhor, dizer isso com todas as letras; quando não for, avisar.
2. **"Ao concluir a rota, não uma pergunta genérica — várias perguntas específicas."** Com um
   critério declarado por ele: o vendedor precisa descrever o que analisou na obra **de um jeito
   que gere mais vendas depois**. E essa análise tem de poder ser **enviada pelo WhatsApp**.

## 2. O que existe hoje (medido em 12/09/2026 — não re-descubra)

- 🔴 **Não existe tabela de rota.** Uma rota é o conjunto de visitas de **um dia, de uma pessoa**,
  remontado a partir da agenda (`src/lib/rota-do-dia.ts`). Cada parada é uma linha de `eventos`
  com `obra_id`, e **cada parada tem o seu próprio `grupo_id`** (grupo é "mesma visita, vários
  participantes" — uma parada com 3 participantes são 3 linhas).
- **A ordem é o relógio.** Desde 28/08/2026 a regra é uma só: de cima para baixo, do mais cedo
  para o mais tarde (`src/lib/ordem-das-paradas.ts`). Arrastar uma parada **redistribui os
  horários** — o conjunto de faixas que a pessoa montou é preservado, só muda quem ocupa cada uma.
- **O serviço de rotas é o OSRM público de demonstração**
  (`https://router.project-osrm.org/route/v1/driving`, em `src/lib/osrm.ts`): sem chave, sem
  acordo de disponibilidade. Por isso o hook `useRotaOsrm` guarda a resposta por uma hora, tenta
  mais uma vez e corta em 12 segundos; sem trajeto, o mapa liga as paradas por linha reta
  tracejada em vez de sumir com a rota.
- **Uso real:** 12 dias com rota, 18 paradas no total, média de **1,5 parada por dia**, maior rota
  com 5. Só **uma** rota teve 3 paradas ou mais. Ou seja: a sugestão de ordem só passa a valer
  quando a equipe usar de verdade — e com 2 paradas não existe ordem melhor.
- **A pergunta de hoje é uma só:** ao marcar "Visita já realizada", aparece um campo de texto com
  o rótulo *"O que você viu nesta obra?"*, gravado em `eventos.visita_observacao` pela
  `useMarcarVisitaRealizada`, que **atualiza o grupo inteiro de uma vez**. Das **6** visitas
  marcadas como realizadas, só **2** têm texto — pergunta aberta é fácil de pular.
- **Enviar a rota pelo WhatsApp já existe:** `mensagemDaRota` (`src/lib/rota-no-whatsapp.ts`)
  monta o texto com as paradas e um link do Google Maps (teto medido de 9 pontos intermediários,
  com aviso de quantas ficaram de fora), e `useEnviarRota` manda pelo `whatsapp-send`. O destino
  pode ser contato ou conversa, **inclusive grupo** — por isso o telefone vai literal, sem
  limpeza (CLAUDE.md §7.2). Não há trava de repetição, porque é texto para uma pessoa por vez.
- **`tarefas` não tem coluna de obra.** Ela liga `cliente_id`, `pedido_id` e `conversa_id`.
  `obras.cliente_id` é **NOT NULL**, então toda obra tem cliente.
- ⚠️ **Outra sessão mexeu nesta área em 12/09/2026** (commit `49588ea0`: a nova rota de visita no
  celular, em `Obras.tsx` e `NovaRotaVisitaDialog.tsx`). Antes de executar, releia esses arquivos.

## 3. Decisões do dono do produto (12/09/2026 — não reabrir)

1. **Ordem melhor: avisa e oferece trocar.** Mostra quanto tempo economiza e um botão "usar esta
   ordem"; quem decide é a pessoa. Trocar reorganiza quem ocupa cada horário, mantendo a grade.
2. **A primeira parada fica de pé.** O cálculo reorganiza da segunda em diante — é a visita
   combinada ou a mais perto de casa, e assim não é preciso perguntar de onde a pessoa sai.
3. **O aviso aparece ao montar/editar a rota**, onde dá para trocar antes de salvar e antes de
   combinar horário com o cliente.
4. **As quatro perguntas da visita:** fase da obra, concorrente visto, com quem falou, próximo
   passo. O texto livre de hoje continua, como "mais alguma coisa".
5. **O próximo passo vira tarefa**, com a data marcada.
6. **O envio é o resumo do dia**, pelo botão de enviar rota que já existe.

### Decisões do desenho, apresentadas e aprovadas

7. **Serviço fora do ar, lento ou obra sem localização: nenhuma sugestão.** Chutar por linha reta
   daria conselho errado em cidade com rio, ponte ou mão única.
8. **Nenhuma pergunta é obrigatória.** Pergunta obrigatória faz fechar a tela — e o número de
   hoje (2 de 6) já mostra o tamanho do atrito.
9. **As respostas ficam na própria visita**, do mesmo jeito que "realizada" e a observação já
   ficam.
10. **A tarefa do próximo passo liga ao CLIENTE da obra** e nomeia a obra no título. `tarefas` não
    tem coluna de obra, e criar uma mexeria na tela de tarefas inteira.
11. **A fase da obra aparece na ficha da obra** como "última fase conhecida", com a data da visita
    — calculada da visita mais recente que respondeu, sem coluna nova em `obras`.

## 4. O desenho

### 4.1 A melhor ordem das paradas

**Quando calcula:** ao montar ou editar a rota, com **3 ou mais paradas com localização**. Com 2,
silêncio — não existe ordem melhor.

**Como calcula:** o mesmo OSRM, no serviço `trip` (`/trip/v1/driving/...?source=first&
roundtrip=false&…`), que resolve a melhor sequência em uma requisição só — saindo da primeira
parada e sem voltar para ela (decisão 2). Mesmas guardas do trajeto de hoje: 12 segundos, uma
tentativa a mais, resposta guardada por uma hora, e leitura defensiva (o servidor de demonstração
responde `NoRoute`, `TooBig` ou HTML quando está sobrecarregado).

**O que a tela diz:**

| Situação | A tela |
|---|---|
| A ordem montada já é a melhor | **"Perfeito, nosso sistema de rotas aponta esse caminho como o mais produtivo."** |
| Existe ordem melhor, com ganho relevante | "Esta ordem economiza cerca de **X min**." + botão **Usar esta ordem** |
| Ganho abaixo de 5 minutos | trata como já ótima (a frase acima) — mexer na rota por 2 minutos é conselho que atrapalha |
| Serviço fora, lento, ou menos de 3 obras com localização | nada aparece |

**O que o botão faz:** troca **quem ocupa cada horário**, na grade que a pessoa já montou — a
mesma mecânica de arrastar uma parada (`ordem-das-paradas.ts`). Ninguém ganha horário novo: se a
rota era 09:00, 09:30 e 15:00, continua 09:00, 09:30 e 15:00, com outras obras nessas faixas.

### 4.2 As perguntas da visita concluída

Ao marcar **"Visita já realizada"**, no lugar do campo único aparecem:

| Pergunta | Como se responde | Por que ela se paga |
|---|---|---|
| **Em que fase está a obra?** | lista de tocar: fundação, estrutura, alvenaria, instalações, acabamento, entrega | diz o que aquela obra vai comprar e quando |
| **Viu produto de concorrente?** | texto curto, com um toque para "nenhum" | diz quem está ganhando a obra, e com qual marca |
| **Com quem você falou?** | os contatos daquela obra, que o sistema já conhece | sem isso a próxima visita recomeça do zero |
| **Próximo passo** | texto curto + data | é a única resposta que vira trabalho futuro |
| **Mais alguma coisa** | o texto livre de hoje | o que não cabe nas quatro |

Todas opcionais (decisão 8). A lista de fases é **fixa no código** — fase de obra é vocabulário do
ramo, não configuração de empresa.

**Onde ficam:** cinco colunas novas em `eventos`, ao lado das duas que já existem
(`visita_realizada`, `visita_observacao`): `visita_fase`, `visita_concorrentes`,
`visita_contato_id`, `visita_proximo_passo`, `visita_proximo_passo_em`. A gravação continua sendo
por `grupo_id` — o grupo inteiro de uma vez, como hoje.

**Onde aparecem:** nos dois lugares em que se marca a visita como realizada — a janela da rota
(editando) e o painel de visitas —, pelo mesmo componente, para não nascerem duas versões da
mesma pergunta.

### 4.3 O próximo passo vira tarefa

Ao gravar a visita com próximo passo preenchido, o sistema cria **uma** tarefa:

- título: `Próximo passo — <nome da obra>`;
- descrição: o texto do próximo passo;
- prazo: a data marcada;
- cliente: o `cliente_id` da obra (decisão 10);
- responsável: quem gravou a visita.

Sem data, não vira tarefa — tarefa sem prazo não cobra ninguém, e vira lista morta. Se a criação
da tarefa falhar, **a visita continua gravada** e a tela avisa o que faltou: o trabalho da pessoa
não pode se perder por causa do passo seguinte.

### 4.4 A fase na ficha da obra

A ficha da obra passa a mostrar **"Fase: acabamento · visto em 12/09"**, da visita mais recente que
respondeu a pergunta. Sem visita respondida, não mostra nada — ausência de informação não vira
informação.

### 4.5 O envio pelo WhatsApp

O botão de enviar rota continua o mesmo. A mensagem passa a trazer, embaixo de cada obra **já
visitada**, o que a análise tiver: fase, concorrente, com quem falou e próximo passo. Obra ainda
não visitada sai como hoje, só com nome e horário. O link do Google Maps continua sozinho na
última linha (grudado em texto, o WhatsApp não gera a previsão do trajeto).

## 5. O que este trabalho NÃO faz

| | Por quê |
|---|---|
| Não cria tabela de rota | O dia continua sendo a rota (`rota-do-dia.ts`); criar tabela é remodelar a agenda inteira |
| Não cria coluna de obra em `tarefas` | Mexeria na tela de tarefas inteira; a tarefa liga ao cliente e nomeia a obra |
| Não reordena nada sozinho | Decisão 1: quem troca é a pessoa |
| Não torna pergunta obrigatória | Decisão 8 |
| Não contrata servidor de rotas | O de demonstração já é o que existe; sem ele, o sistema só deixa de sugerir |
| Não deixa a lista de fases configurável por empresa | Vocabulário do ramo. Se alguém pedir, vira pedido próprio |
| Não manda a análise sozinho para ninguém | Enviar é sempre gesto da pessoa, para um destino que ela escolhe |

## 6. Como se prova que funcionou

**Testes automatizados** (as funções puras, sem tela):

- a melhor ordem: com a resposta do serviço simulada, a sugestão **mantém a primeira parada** e
  devolve a nova sequência; ganho abaixo de 5 minutos vira "já está na melhor ordem"; resposta
  ruim (`NoRoute`, HTML, sem `trips`) devolve "sem sugestão", nunca uma ordem inventada;
- aplicar a sugestão **preserva a grade de horários** — o conjunto de faixas antes e depois é o
  mesmo, só muda quem ocupa cada uma;
- menos de 3 paradas com localização: não pede nada ao serviço;
- a mensagem do WhatsApp: obra visitada sai com as respostas que existirem; obra sem análise sai
  como hoje; o link continua na última linha;
- a tarefa do próximo passo: título com o nome da obra, prazo na data marcada, cliente da obra;
  sem data, nenhuma tarefa.

**Ensaio na tela** (sem gravar em produção — o ensaio para antes de salvar, e **não envia
mensagem para ninguém** a não ser para o próprio número do Lucas, se ele quiser ver):

1. Montar uma rota com 3 obras fora de ordem: aparece o aviso com o ganho e o botão. Aplicar e
   conferir que os horários continuam os mesmos, com outras obras neles.
2. Montar a mesma rota na ordem certa: aparece a frase "Perfeito, nosso sistema de rotas aponta
   esse caminho como o mais produtivo."
3. Rota com 2 paradas: nenhuma mensagem sobre ordem.
4. Marcar uma visita como realizada e responder as quatro perguntas; conferir que a tarefa do
   próximo passo aparece na tela Hoje, e que a ficha da obra mostra a fase.
5. Abrir o envio da rota e conferir, **na prévia**, que a análise aparece embaixo da obra visitada.
