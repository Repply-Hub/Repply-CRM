import type { SecaoId } from '@/lib/secoes';

/**
 * Conteúdo da página de Ajuda (`src/pages/Ajuda.tsx`), separado da apresentação para poder
 * ser editado sem tocar em JSX.
 *
 * `imagem.chave` é o identificador estável do espaço de print — desde 21/09/2026, a BASE do
 * nome de uma galeria (`GaleriaDaAjuda.tsx`), não mais uma chave de imagem única: o admin
 * decide na própria tela se sobe uma foto só ou várias, sem precisar de código novo por
 * tópico. Fica gravado em `ajuda_imagens` (banco) e como nome de arquivo no balde
 * `ajuda-imagens` (ver a migration `20260915090000_ajuda_imagens.sql`). O admin da plataforma
 * envia a imagem pela própria página de Ajuda (`src/hooks/use-ajuda-imagens.ts`) — não há
 * upload manual de asset pelo código. `imagem.legenda` é o que aparece para o admin enquanto
 * a sequência daquele tópico ainda está vazia, dizendo exatamente qual tela fotografar.
 *
 * 🔴 NÃO troque uma `chave` já publicada sem apagar a linha antiga em `ajuda_imagens`: a
 * imagem enviada para a chave antiga fica órfã, sem nenhum tópico apontando para ela.
 *
 * 🔴 TODO tópico tem `imagem` — é o que faz a coluna de imagem da tela existir para cada
 * funcionalidade, mesmo que o print ainda não tenha sido enviado (decisão de produto de
 * 15/09/2026, depois de uma varredura funcionalidade a funcionalidade contra o código real).
 */

export interface ImagemDoTopico {
  /** Identificador estável — vira o nome do arquivo no balde. Não reaproveite entre tópicos. */
  chave: string;
  /** O que fotografar, mostrado ao admin como guia enquanto não há imagem enviada. */
  legenda: string;
}

/**
 * Um passo numerado com sequência de fotos própria — para quando o passo a passo é longo
 * demais para uma imagem só do tópico explicar tudo (ex.: 5 passos, 5 telas diferentes), ou
 * quando UM passo sozinho precisa de mais de uma tela para se explicar. As fotos entram
 * penduradas abaixo DAQUELE número na lista, num carrossel, não na coluna do tópico inteiro.
 *
 * Continua opcional por passo: a maioria dos tópicos tem poucos passos e a galeria do
 * `ImagemDoTopico` já basta, então um `PassoAjuda` comum (`string`) não ganha galeria
 * própria — só a do tópico.
 *
 * Mesmo mecanismo de `ImagemDoTopico.chave` (`prefixo` é a BASE do nome): o admin sobe
 * quantas fotos quiser pela própria tela, sem precisar de código novo a cada uma — a 1ª foto
 * enviada vira `<prefixo>-1`, a 2ª `<prefixo>-2`, e assim por diante (`GaleriaDaAjuda.tsx`
 * calcula o próximo número sozinho). Existe como tipo à parte porque um passo de dentro do
 * tópico precisa da própria legenda/prefixo, diferente da galeria do tópico inteiro — mas as
 * duas usam o mesmo componente e a mesma tabela `ajuda_imagens`.
 */
export interface PassoComGaleria {
  texto: string;
  /** Base do nome de cada foto da sequência. Não reaproveite entre passos. */
  prefixo: string;
  /** O que fotografar nesta sequência, mostrado ao admin enquanto ela ainda está vazia. */
  legenda: string;
}

export type PassoAjuda = string | PassoComGaleria;

export function textoDoPasso(passo: PassoAjuda): string {
  return typeof passo === 'string' ? passo : passo.texto;
}

export function galeriaDoPasso(passo: PassoAjuda): { prefixo: string; legenda: string } | undefined {
  return typeof passo === 'string' ? undefined : { prefixo: passo.prefixo, legenda: passo.legenda };
}

export interface TopicoAjuda {
  titulo: string;
  passos: PassoAjuda[];
  /** Comportamento que não é óbvio para quem nunca usou esta tela. */
  aviso?: string;
  imagem: ImagemDoTopico;
}

export interface SecaoAjuda {
  secaoId: SecaoId;
  titulo: string;
  resumo: string;
  topicos: TopicoAjuda[];
}

export const AJUDA_CONTEUDO: SecaoAjuda[] = [
  {
    secaoId: 'hoje',
    titulo: 'Hoje',
    resumo:
      'A lista do que precisa da sua atenção agora, montada automaticamente pelo sistema. Não é um mural de avisos, é uma fila de trabalho que encolhe conforme você resolve cada item.',
    topicos: [
      {
        titulo: 'Como a pauta é montada',
        // Cinco passos, cinco telas diferentes — a imagem única do tópico (mais abaixo) não dava
        // conta de mostrar todas. Cada passo ganhou a própria galeria (decisão de 15/09/2026),
        // que aceita mais de uma foto em sequência quando uma tela só não bastar.
        passos: [
          {
            texto:
              'Todo negócio parado há muitos dias sem resposta do cliente entra automaticamente na pauta. O sistema olha a data da última movimentação de cada negócio aberto e compara com o número de dias configurado.',
            prefixo: 'hoje-pauta-passo-1', legenda: 'Negócio parado na pauta, com os dias parado e a data da última movimentação à mostra',
          },
          {
            texto:
              'A pauta também traz os compromissos de hoje que estão no seu Calendário, misturados com os negócios parados na mesma lista. Um compromisso aparece com um selo diferente do negócio, e clicar nele leva direto para a tela de Calendário, não para o painel lateral (que é o que abre ao clicar num negócio).',
            prefixo: 'hoje-pauta-passo-2', legenda: 'Um compromisso e um negócio parado lado a lado na pauta, com o selo de cada um visível',
          },
          {
            texto:
              'A partir de quantos dias um negócio "conta" como parado é configurável: em Configurações, na aba Automação, existe o campo que define esse corte para a empresa inteira.',
            prefixo: 'hoje-pauta-passo-3', legenda: 'Campo de dias parado na aba Automação, em Configurações',
          },
          {
            texto:
              'Ao resolver um item (responder o cliente, mudar a etapa do negócio, registrar um comentário), ele some da lista na próxima vez que a página for carregada. Por isso a pauta encolhe ao longo do dia, em vez de crescer sem parar.',
            prefixo: 'hoje-pauta-passo-4', legenda: 'Pauta antes e depois de um item ser resolvido e sair da lista',
          },
          {
            texto:
              'A pauta não guarda histórico: ela sempre mostra a situação atual. Um negócio resolvido hoje pode voltar a aparecer amanhã ou depois, se ficar parado de novo pelo mesmo motivo.',
            prefixo: 'hoje-pauta-passo-5', legenda: 'Negócio que voltou a aparecer na pauta depois de ficar parado de novo',
          },
        ],
        aviso:
          'A pauta não é uma lista fixa que alguém preenche à mão: ela é recalculada toda vez que a tela é aberta, a partir das regras de negócio parado configuradas pela empresa.',
        imagem: { chave: 'hoje-pauta', legenda: 'Tela Hoje com alguns itens na pauta (negócio e compromisso) e o painel lateral de um negócio aberto' },
      },
      {
        titulo: 'Abrir um item e decidir o que fazer',
        passos: [
          'Clique no item da pauta para abrir o negócio correspondente no painel lateral, sem sair da tela Hoje.',
          'No painel, você vê o histórico do negócio, os contatos envolvidos e pode registrar um comentário ou mudar a etapa dele no funil.',
          'Se não for possível agir agora (o cliente pediu para retornar depois, por exemplo), use o botão "Retomar depois" para escolher uma nova data. O item some da pauta de hoje e volta a aparecer automaticamente nessa data escolhida.',
        ],
        imagem: { chave: 'hoje-retomar-depois', legenda: 'Botão "Retomar depois" aberto, com o calendário de nova data' },
      },
      {
        titulo: 'Radar de Risco e Tabela do Time (só para gestor)',
        passos: [
          'Quem tem a permissão de ver a pauta de toda a equipe também enxerga, no topo da tela, os cartões do "Radar de Risco" com o total de negócios parados por faixa de urgência.',
          'Logo abaixo fica a "Tabela do Time", com o resumo de quantos negócios parados cada vendedor tem sob responsabilidade.',
          'A barra de filtros permite recortar essa visão por Etapa do funil, por Fabricante e, para quem vê a pauta de todos, por Responsável. O botão "Limpar" volta ao recorte padrão.',
          'Um gestor pode desligar essa visão ampliada e passar a ver apenas os próprios negócios parados, do mesmo jeito que um vendedor comum vê.',
        ],
        aviso:
          'Um vendedor comum vê só a própria pauta, nunca a da equipe inteira. A visão do time depende de uma permissão específica concedida em Configurações, não apenas do cargo da pessoa.',
        imagem: { chave: 'hoje-radar-risco', legenda: 'Cartões do Radar de Risco e a Tabela do Time, com a barra de filtros visível' },
      },
    ],
  },
  {
    secaoId: 'dashboard',
    titulo: 'Dashboard',
    resumo:
      'Os gráficos e indicadores comerciais da empresa, com filtro por período, por vendedor e por fabricante representado.',
    topicos: [
      {
        titulo: 'Filtrar os gráficos',
        passos: [
          'Escolha o período que quer analisar no seletor de datas, no topo da tela. É possível escolher um intervalo personalizado ou usar um dos atalhos prontos (últimos 30 dias, mês atual, e assim por diante).',
          'Refine ainda mais usando os campos de seleção de vendedor e de fabricante, que aceitam mais de uma escolha ao mesmo tempo. Isso é útil para comparar dois vendedores específicos ou olhar só o desempenho de uma marca.',
          'Use o botão "Limpar filtros" para voltar de uma vez ao período e à seleção padrão, sem precisar desmarcar campo por campo.',
        ],
        aviso:
          'Os valores em R$ contam pela data em que o negócio foi FECHADO, não pela data em que foi criado. Um negócio aberto há meses só entra nas métricas de dinheiro do período quando fecha dentro dele. Isso explica por que um mês pode parecer "fraco" mesmo tendo muitos negócios novos: eles só aparecem no dinheiro quando forem fechados.',
        imagem: { chave: 'dashboard-filtros', legenda: 'Tela Dashboard com os filtros de período, vendedor e fabricante preenchidos' },
      },
      {
        titulo: 'Exportar um relatório em PDF',
        passos: [
          'Ajuste os filtros de período, vendedor e fabricante da forma que você quer levar para a reunião ou enviar por e-mail.',
          'Clique em "Exportar PDF" para baixar um arquivo com um retrato fiel dos gráficos exibidos na tela naquele momento, já formatado para impressão.',
        ],
        imagem: { chave: 'dashboard-exportar-pdf', legenda: 'Botão "Exportar PDF" no Dashboard, em destaque' },
      },
      {
        titulo: 'Plano de Vendas',
        passos: [
          'A seção "Plano de Vendas", quando disponível, mostra a meta definida para a empresa e o quanto já foi realizado, com a quebra por fabricante representado.',
          'As setas de "Mês anterior" e "Próximo mês" navegam pelo período do plano e também atualizam o filtro de Período do restante da página.',
          'Quem tem a permissão correspondente pode alternar a visão entre "por fabricante" e "por vendedor", para comparar o desempenho individual da equipe.',
          'Ela só aparece para quem tem a permissão do módulo "Plano de Vendas" liberada em Configurações. Se você não a vê, provavelmente é uma questão de permissão, não de falta de dados.',
        ],
        imagem: { chave: 'dashboard-plano-vendas', legenda: 'Seção Plano de Vendas, com meta x realizado por fabricante' },
      },
      {
        titulo: 'Definir e editar as metas do Plano de Vendas',
        passos: [
          'Clique em "Definir metas" (ou "Editar metas", se já houver alguma lançada) dentro do Plano de Vendas.',
          'Lance a meta mês a mês, por fabricante. Também é possível alocar parte da meta para cada vendedor da equipe.',
          'A ordem dos fabricantes na lista pode ser reorganizada manualmente, para os mais relevantes aparecerem primeiro.',
        ],
        aviso: 'Só quem tem a permissão de criar ou editar meta vê este botão. Sem ela, o Plano de Vendas aparece só para consulta.',
        imagem: { chave: 'dashboard-definir-metas', legenda: 'Diálogo de definir metas do Plano de Vendas, com um mês preenchido' },
      },
      {
        titulo: 'Métricas de atendimento no WhatsApp',
        passos: [
          'Quando a empresa tem o módulo WhatsApp contratado, o Dashboard de gestor/admin ganha três cartões extras: volume de atendimento por status (conversas abertas e fechadas), tempo até a primeira resposta por atendente, e conversas atribuídas por responsável.',
          'Esses cartões seguem os mesmos filtros de período da parte superior da tela.',
        ],
        aviso: 'Some sozinho quando a empresa não tem WhatsApp contratado, ou quando quem está vendo não é gestor ou admin.',
        imagem: { chave: 'dashboard-metricas-whatsapp', legenda: 'Cartões de métricas de atendimento no WhatsApp, no Dashboard' },
      },
    ],
  },
  {
    secaoId: 'pipeline',
    titulo: 'Negócios',
    resumo: 'O funil de orçamentos da empresa, o coração do sistema: é aqui que cada oportunidade de venda é acompanhada do início ao fim.',
    topicos: [
      {
        titulo: 'Criar um negócio novo',
        passos: [
          'Clique no botão "+ Novo Negócio", no topo da tela.',
          'Escolha o cliente e o fabricante representado envolvidos nesse orçamento. Os dois campos são obrigatórios: o sistema não permite salvar um negócio sem essa dupla.',
          'Preencha os demais dados que tiver disponíveis no momento: valor previsto, obra relacionada (se houver), data de fechamento prevista e observações.',
          'Salve o formulário. O negócio recém-criado aparece na primeira coluna do funil, pronto para começar a andar entre as etapas.',
        ],
        imagem: { chave: 'pipeline-novo-negocio', legenda: 'Diálogo "Novo Negócio" preenchido com dados de exemplo (Cliente Exemplo, Fabricante Exemplo)' },
      },
      {
        titulo: 'Anexar o PDF do orçamento a um negócio',
        passos: [
          'Na tela de edição do negócio, procure o campo de anexo de PDF.',
          'Envie o arquivo do orçamento. É possível substituir por um PDF mais novo ou remover o anexo depois, se precisar.',
          'Quando houver um PDF anexado, ele fica disponível para visualização direto no painel lateral do negócio, sem precisar baixar o arquivo.',
        ],
        imagem: { chave: 'pipeline-anexar-pdf', legenda: 'Campo de anexo de PDF na edição do negócio, com um arquivo já enviado' },
      },
      {
        titulo: 'Mover um negócio entre etapas',
        passos: [
          'No modo Kanban, clique e arraste o card do negócio até a coluna da nova etapa (por exemplo, de "Orçamento enviado" para "Negociação").',
          'O sistema grava sozinho, no histórico do negócio, quando essa mudança de etapa aconteceu, sem precisar de nenhuma ação extra sua.',
        ],
        aviso:
          'Pode existir mais de um funil cadastrado na empresa. O filtro de funil, no topo da tela, decide qual conjunto de colunas você está vendo naquele momento; vale conferir se está no funil certo antes de procurar um negócio que parece ter sumido.',
        imagem: { chave: 'pipeline-mover-etapa', legenda: 'Card de negócio sendo arrastado entre duas colunas do Kanban' },
      },
      {
        titulo: 'Personalizar as colunas e os marcadores do funil',
        passos: [
          'Abra "Gerenciar colunas" para criar uma etapa nova, renomear uma existente, mudar a ordem em que elas aparecem ou remover uma que não faz mais sentido.',
          'Abra "Marcadores" para criar etiquetas coloridas (por exemplo, "Urgente" ou "Aguardando cliente") e aplicá-las aos negócios, o que ajuda a identificar rapidamente prioridades numa lista grande.',
        ],
        imagem: { chave: 'pipeline-gerenciar-colunas', legenda: 'Diálogo "Gerenciar colunas" do funil, com as etapas listadas' },
      },
      {
        titulo: 'Criar e gerenciar múltiplos funis',
        passos: [
          'Dentro do diálogo "Gerenciar colunas", use o seletor de funil para trocar qual funil está sendo editado, ou clique em "Novo funil" para criar um funil inteiro à parte (útil para separar, por exemplo, vendas de projetos e de reposição).',
          'É possível renomear ou excluir um funil existente. Só dá para excluir um funil que não tenha nenhum negócio vinculado.',
        ],
        imagem: { chave: 'pipeline-gerenciar-funis', legenda: 'Diálogo de gerenciar funis, com a lista de funis da empresa' },
      },
      {
        titulo: 'Importar negócios de uma planilha',
        passos: [
          'Clique em "Importar" e escolha o arquivo, que pode ser Excel ou CSV.',
          'Confira a prévia que o sistema mostra antes de confirmar. Se alguma linha tiver data de criação no futuro, o sistema avisa: isso costuma ser sinal de que a planilha tem uma coluna de data com dia e mês trocados.',
          'Corrija o que for preciso na planilha original, se o aviso apontar algo estranho, e confirme a importação só depois de revisar a prévia.',
        ],
        imagem: { chave: 'pipeline-importar', legenda: 'Prévia da importação de negócios, com uma linha de exemplo' },
      },
      {
        titulo: 'Exportar negócios',
        passos: [
          'Use "Exportar" no menu de ações para baixar os negócios em Excel ou CSV.',
          'É possível exportar só um negócio específico direto pela linha da lista, ou exportar todos os negócios que passam pelo filtro atual.',
          'Quando o filtro devolve muitos negócios, o sistema avisa e pergunta se você quer uma amostra ou o total, antes de gerar o arquivo.',
        ],
        imagem: { chave: 'pipeline-exportar', legenda: 'Diálogo de exportar negócios, com a escolha de formato' },
      },
      {
        titulo: 'Aplicar uma ação em massa (etapa, marcador ou responsável)',
        passos: [
          'Abra "Ação em Massa" no menu de ações da lista de negócios.',
          'Use os filtros próprios desse diálogo (Etapa, Responsável, Marcador, Período) para escolher exatamente quais negócios entram na mudança.',
          'Escolha o que quer aplicar de uma vez: uma nova etapa, um novo marcador ou um novo responsável para todos os negócios selecionados.',
        ],
        aviso: 'É diferente de excluir em massa: aqui você MUDA um dado dos negócios escolhidos, não apaga nada.',
        imagem: { chave: 'pipeline-acao-em-massa', legenda: 'Diálogo de Ação em Massa, com os filtros e o campo de novo valor preenchidos' },
      },
      {
        titulo: 'Selecionar vários negócios de uma vez para excluir',
        passos: [
          'Marque a caixa de seleção de um ou mais negócios na lista.',
          'Ao escolher excluir, o sistema pergunta se você quer aplicar a ação apenas aos negócios marcados nesta página ou a todos os que passam pelo filtro atual (mesmo os que não estão visíveis na tela). São opções diferentes, e vale ler a pergunta com atenção antes de confirmar.',
          'Para excluir vários negócios de uma vez, é preciso digitar uma palavra de confirmação antes que o botão de excluir fique disponível. Essa etapa extra existe de propósito, para reduzir o risco de apagar algo por engano.',
        ],
        aviso:
          '"Selecionar todos os que passam pelo filtro" e "selecionar apenas os desta página" são coisas diferentes. Confira qual opção está marcada antes de excluir em massa, especialmente quando o filtro estiver retornando mais negócios do que cabem numa única página.',
        imagem: { chave: 'pipeline-excluir-em-massa', legenda: 'Diálogo de confirmação de exclusão em massa, com a palavra de confirmação' },
      },
      {
        titulo: 'A ficha completa de um negócio',
        passos: [
          'Clique num negócio para abrir o painel lateral com a ficha completa dele.',
          'Ali você encontra: comentários manuais (separados do histórico automático), o histórico de movimentação entre etapas, o histórico de contato com a pessoa (anotações e o resumo automático da conversa de WhatsApp, quando houver), os contatos vinculados ao negócio (com atalho direto para abrir a conversa de WhatsApp de cada um), e a opção de criar uma tarefa já vinculada a este negócio.',
          'Quando há um PDF anexado, ele pode ser visualizado direto dali, num visualizador embutido, sem precisar baixar o arquivo.',
        ],
        imagem: { chave: 'pipeline-ficha-negocio', legenda: 'Painel lateral de um negócio, com as abas de comentários e histórico visíveis' },
      },
    ],
  },
  {
    secaoId: 'clientes',
    titulo: 'Clientes',
    resumo: 'O cadastro das empresas que compram e das pessoas de contato dentro de cada uma delas.',
    topicos: [
      {
        titulo: 'Cadastrar um cliente novo',
        passos: [
          'Na aba "Empresas", clique em "+ Novo Cliente".',
          'O formulário é dividido em etapas. Na primeira, você preenche os dados da empresa cliente (nome, CNPJ, endereço, e assim por diante).',
          'Nas etapas seguintes, é possível já cadastrar o primeiro contato dessa empresa, informando nome, telefone e e-mail da pessoa, ou pular essa parte e cadastrar o contato depois, na ficha do cliente.',
          'Ao final de todas as etapas, salve o cadastro. O cliente passa a aparecer na lista da aba "Empresas".',
        ],
        imagem: { chave: 'clientes-novo-cliente', legenda: 'Formulário de novo cliente na etapa de dados da empresa' },
      },
      {
        titulo: 'Alternar entre Empresas e Contatos',
        passos: [
          'Use as abas no topo da tela para ver a lista de empresas clientes ou a lista de pessoas de contato separadamente.',
          'A aba Contatos é útil quando você lembra do nome da pessoa mas não da empresa em que ela trabalha, já que a busca dessa aba procura entre os contatos, não entre as empresas.',
        ],
        imagem: { chave: 'clientes-abas', legenda: 'Abas Empresas e Contatos, no topo da tela de Clientes' },
      },
      {
        titulo: 'Filtrar e personalizar as colunas da lista',
        passos: [
          'Use os filtros de Tipo, UF, Cidade, Classificação e "Criado por" para recortar a lista de empresas além da busca por nome.',
          'Abra "Gerenciar colunas" para adicionar, remover, renomear ou reordenar as colunas exibidas, e salve como um preset para reaproveitar depois.',
        ],
        imagem: { chave: 'clientes-filtros-colunas', legenda: 'Filtros avançados e o diálogo de gerenciar colunas da lista de Clientes' },
      },
      {
        titulo: 'Gerenciar os tipos de cliente',
        passos: [
          'Dentro do formulário de cadastro ou edição de um cliente, abra "Gerenciar Tipos".',
          'Crie, renomeie ou exclua os tipos (categorias) usados para classificar as empresas clientes, como "Construtora" ou "Loja".',
        ],
        imagem: { chave: 'clientes-gerenciar-tipos', legenda: 'Diálogo de gerenciar tipos de cliente' },
      },
      {
        titulo: 'Na ficha de um cliente',
        passos: [
          'Clique no cliente na lista para abrir sua ficha completa.',
          'De dentro da ficha, sem precisar sair dela, é possível: vincular uma obra existente ou cadastrar uma nova, adicionar um contato novo ou vincular um contato já cadastrado em outro lugar, criar uma tarefa relacionada a esse cliente, abrir um negócio novo já com o cliente preenchido e enviar um e-mail diretamente para um dos contatos.',
          'A ficha também lista tudo que já está vinculado a esse cliente (obras, contatos, negócios e tarefas), o que dá uma visão completa do relacionamento sem precisar procurar em outras telas.',
        ],
        imagem: { chave: 'clientes-ficha-cliente', legenda: 'Ficha completa de um cliente, com obras e contatos vinculados' },
      },
      {
        titulo: 'A ficha de um contato',
        passos: [
          'Clique num contato, na aba Contatos, para abrir a ficha dele.',
          'Dali é possível editar os dados da pessoa, trocar a empresa a que ela está vinculada ("Vincular Empresa"), ver as tarefas e negócios da empresa vinculada, ou excluir o contato.',
        ],
        imagem: { chave: 'clientes-ficha-contato', legenda: 'Ficha de um contato, com o botão de vincular empresa' },
      },
      {
        titulo: 'Importar clientes de uma planilha',
        passos: [
          'Clique em "Importar" e escolha o arquivo.',
          'Revise a prévia com atenção antes de confirmar: é o momento de perceber, por exemplo, se algum CNPJ veio com formatação estranha da planilha.',
        ],
        imagem: { chave: 'clientes-importar', legenda: 'Prévia da importação de clientes, com uma linha de exemplo' },
      },
      {
        titulo: 'Exportar e excluir clientes em massa',
        passos: [
          'Use "Exportar" para baixar a lista de empresas ou contatos em Excel ou CSV.',
          'Para excluir vários de uma vez, marque os desejados e escolha entre excluir só os desta página ou todos os que passam pelo filtro atual, do mesmo jeito que em Negócios.',
        ],
        imagem: { chave: 'clientes-exportar-excluir', legenda: 'Menu de ações da lista de Clientes, com Exportar e Excluir em massa' },
      },
    ],
  },
  {
    secaoId: 'obras',
    titulo: 'Obras',
    resumo: 'O canteiro de obra, que pode ter CNPJ próprio quando for uma SPE (Sociedade de Propósito Específico criada só para aquela obra).',
    topicos: [
      {
        titulo: 'Cadastrar uma obra e ver no mapa',
        passos: [
          'Clique em "+ Nova Obra" e preencha o endereço. O sistema sugere endereços conforme você digita, o que ajuda a evitar erro de digitação e garante que a obra apareça no lugar certo do mapa.',
          'Preencha também os demais dados disponíveis, como o nome da obra e, se for o caso, o CNPJ da SPE responsável por ela.',
          'A aba "Mapa" mostra todas as obras cadastradas pela empresa, posicionadas geograficamente, o que ajuda a visualizar a concentração de canteiros numa região.',
        ],
        imagem: { chave: 'obras-cadastrar-mapa', legenda: 'Aba Mapa de Obras com alguns marcadores no mapa' },
      },
      {
        titulo: 'A lista de obras: colunas, filtro e exclusão em massa',
        passos: [
          'Na aba "Lista", personalize as colunas exibidas em "Gerenciar colunas" e ordene clicando no cabeçalho de qualquer uma delas.',
          'Filtre por marcador ou por período de criação para achar mais rápido o que procura.',
          'Selecione várias obras e exclua em massa, com a mesma confirmação usada em Negócios e Clientes.',
        ],
        imagem: { chave: 'obras-lista', legenda: 'Aba Lista de Obras, com colunas personalizadas e o filtro aberto' },
      },
      {
        titulo: 'Gerenciar marcadores de obra',
        passos: [
          'Dentro do filtro de marcador, clique em "Gerenciar" para abrir o diálogo de marcadores.',
          'Crie, edite, reordene (arrastando) ou exclua os marcadores usados para classificar as obras.',
        ],
        imagem: { chave: 'obras-gerenciar-marcadores', legenda: 'Diálogo de gerenciar marcadores de obra' },
      },
      {
        titulo: 'A ficha da obra: vendas, contatos e histórico de visitas',
        passos: [
          'Abra uma obra para ver sua ficha completa, com abas de Vendas, Contatos e Histórico de visitas.',
          'A aba Vendas mostra os negócios ligados àquele endereço, separados por ganho, em aberto e perdido.',
          'A aba Contatos lista as pessoas vinculadas à obra (diferente dos contatos da empresa cliente); editar ou desvincular é feito pelo botão "Editar" da obra.',
          'No Histórico de visitas, quem criou a visita pode marcá-la como realizada e registrar uma observação de campo sobre o que foi visto no local.',
        ],
        imagem: { chave: 'obras-ficha', legenda: 'Ficha de uma obra, com as abas de Vendas e Histórico de visitas' },
      },
      {
        titulo: 'Planejar, enviar e excluir uma rota de visita',
        passos: [
          'Na aba "Visitas", clique em "Nova Rota de Visita" e escolha, entre as obras cadastradas, quais fazem parte dessa rota.',
          'O sistema calcula e mostra o trajeto no mapa, ajudando a organizar a ordem das paradas.',
          'Use "Enviar rota" para mandar o roteiro para um contato ou cliente: o diálogo busca entre os contatos cadastrados e as conversas de WhatsApp já abertas, e mostra uma prévia do texto antes de enviar.',
          'Para excluir uma rota, o sistema lista as paradas uma a uma e avisa que as observações de visitas já realizadas somem junto com a rota.',
        ],
        aviso:
          'A mesma tela de rota de visita também pode ser aberta a partir de um evento criado no Calendário. São o mesmo recurso, só que acessível de dois lugares diferentes, conforme o que for mais prático no momento.',
        imagem: { chave: 'obras-rota-visita', legenda: 'Rota de visita montada no mapa, com o diálogo de enviar rota aberto' },
      },
    ],
  },
  {
    secaoId: 'fabricantes',
    titulo: 'Fabricantes',
    resumo: 'As representadas: as marcas e indústrias que a empresa representa comercialmente.',
    topicos: [
      {
        titulo: 'Cadastrar um fabricante',
        passos: [
          'Clique em "+ Novo Fabricante" e preencha os dados da marca representada.',
          'Gerencie os contatos que trabalham nessa fábrica (gerente regional, representante técnico, e assim por diante), e marque um deles como "Principal" usando o ícone de estrela, para saber rápido quem é a referência.',
          'Se precisar, crie novas "funções" para classificar esses contatos por cargo, já que a lista de funções não é fixa e pode ser ajustada conforme a estrutura de cada fabricante.',
        ],
        imagem: { chave: 'fabricantes-cadastrar', legenda: 'Ficha de um fabricante, com um contato marcado como Principal' },
      },
      {
        titulo: 'Organizar arquivos e catálogos',
        passos: [
          'Cada fabricante tem um espaço próprio de arquivos, chamado "Drive da Fábrica", separado dos arquivos dos demais fabricantes.',
          'Anexe catálogos e outros documentos relevantes, organizando-os por edição: cada arquivo é associado a um ano e, quando fizer sentido, a um mês específico. Arrastar um arquivo direto para essa área também funciona, sem precisar clicar em "Anexar" antes.',
          'Para corrigir o nome ou a edição de um arquivo já anexado, use o botão de editar no card dele. Não é possível trocar o arquivo em si por esse caminho; para isso, exclua e anexe de novo.',
          'Use "Enviar catálogo" quando quiser mandar o material diretamente para um cliente ou para um contato específico, sem precisar baixar o arquivo antes.',
        ],
        imagem: { chave: 'fabricantes-drive', legenda: 'Drive de um fabricante de exemplo com algumas edições de catálogo listadas' },
      },
    ],
  },
  {
    secaoId: 'portal',
    titulo: 'Portal',
    resumo:
      'Apesar do nome, esta seção não é uma área para o cliente acessar. É uma ferramenta interna de consulta a licenças e publicações de órgãos públicos: IDEMA, Diário Oficial de Natal e Diário Oficial de Extremoz.',
    topicos: [
      {
        titulo: 'Buscar e atualizar publicações',
        passos: [
          'Clique em "Atualizar" para buscar as publicações mais recentes de cada órgão público monitorado.',
          'Filtre por tipo de licença (disponível na aba do IDEMA) e por período de data para achar mais rápido o que interessa.',
          'Clique na seta de uma linha para expandir e ler o texto completo encontrado naquela publicação.',
          'Personalize quais colunas ficam visíveis em "Gerenciar colunas": a escolha é lembrada separadamente para cada órgão (IDEMA, Natal, Extremoz).',
          'Exporte a lista filtrada em CSV se precisar levar os dados para uma planilha ou compartilhar com outra pessoa da equipe.',
        ],
        aviso:
          'O nome "Portal" confunde: não é uma área para o cliente entrar, é uma ferramenta interna de monitorar publicações públicas. A atualização de cada órgão pode levar um tempo diferente, e isso é normal.',
        imagem: { chave: 'portal-buscar', legenda: 'Lista de publicações do Portal, com uma linha expandida e o filtro de período' },
      },
    ],
  },
  {
    secaoId: 'calendario',
    titulo: 'Calendário',
    resumo: 'A agenda de compromissos e visitas da equipe, com visão de mês e de semana.',
    topicos: [
      {
        titulo: 'Criar e editar um evento',
        passos: [
          'Clique num horário vazio da agenda ou no botão "+ Novo Evento".',
          'Preencha título, data e horário. No campo de participantes, convide outras pessoas da equipe: é possível selecionar vários de uma vez, ou todos, e marcar se elas devem ser avisadas.',
          'Configure um ou mais lembretes para o evento, escolhendo entre as opções prontas.',
          'Alterne entre a visão de mês (panorama do período inteiro) e a visão de semana (mais detalhe de horários) usando os botões no topo da tela.',
        ],
        aviso: 'Só o organizador original de um evento consegue gerenciar os participantes depois que ele já foi criado.',
        imagem: { chave: 'calendario-novo-evento', legenda: 'Diálogo de novo evento preenchido, com participantes e lembretes' },
      },
      {
        titulo: 'Excluir um evento',
        passos: [
          'Abra o evento e escolha excluir.',
          'Se você é o organizador, a exclusão remove o evento para todos os participantes convidados.',
          'Se você é apenas um participante (não o organizador), a mesma ação só te retira do evento: ele continua existindo para os demais.',
        ],
        imagem: { chave: 'calendario-excluir-evento', legenda: 'Confirmação de exclusão de um evento do Calendário' },
      },
      {
        titulo: 'Criar uma visita a obra a partir de um evento',
        passos: [
          'Ao abrir um evento, procure a aba "Visita a obra", que aparece especificamente nesse contexto de criação ou edição de evento.',
          'A partir dali, você monta a mesma rota de visita que também pode ser criada diretamente pela seção Obras, então o resultado é o mesmo, só muda o ponto de partida.',
        ],
        imagem: { chave: 'calendario-visita-obra', legenda: 'Aba "Visita a obra" dentro do diálogo de evento' },
      },
      {
        titulo: 'Importar uma agenda existente',
        passos: [
          'Procure o botão de importar arquivo de agenda, que aceita o formato .ics (o formato padrão usado por Google Agenda, Outlook e outros calendários).',
          'Escolha o arquivo no seu computador e confirme a importação para trazer os eventos existentes para dentro do sistema.',
        ],
        aviso: 'Esse botão fica num canto discreto da tela, não é o primeiro elemento que chama atenção ao abrir o Calendário.',
        imagem: { chave: 'calendario-importar', legenda: 'Botão de importar agenda .ics, no Calendário' },
      },
    ],
  },
  {
    secaoId: 'tarefas',
    titulo: 'Tarefas',
    resumo: 'As tarefas da equipe, organizadas em quadro (Kanban, com colunas por estágio) ou em lista simples.',
    topicos: [
      {
        titulo: 'Criar e mover uma tarefa',
        passos: [
          'Clique em "+ Nova Tarefa" e preencha título, responsável pela execução e prazo.',
          'Se fizer sentido, vincule a tarefa a uma Empresa (cliente) e/ou a um Negócio específico, e adicione participantes além do responsável principal.',
          'No modo Kanban, arraste o card da tarefa entre as colunas para indicar em que estágio ela está (por exemplo, de "A fazer" para "Em andamento").',
          'Personalize as colunas do quadro em "Gerenciar colunas", caso o fluxo de trabalho da equipe precise de etapas diferentes das que já existem.',
        ],
        imagem: { chave: 'tarefas-criar', legenda: 'Formulário de nova tarefa, com Empresa, Negócio e participantes preenchidos' },
      },
      {
        titulo: 'Marcadores e projetos de tarefa',
        passos: [
          'No formulário da tarefa, use o campo "Marcadores" para classificar por categoria (por exemplo, Prioridade ou Pós-venda). É possível criar e excluir categorias e marcadores dentro do próprio campo.',
          'Use o campo "Projeto" para agrupar tarefas relacionadas a uma mesma iniciativa. A lista de projetos é gerenciável por quem tem acesso de admin, empresa ou gestor.',
        ],
        imagem: { chave: 'tarefas-marcadores-projetos', legenda: 'Campos de Marcadores e Projeto no formulário de tarefa' },
      },
      {
        titulo: 'Alternar entre Kanban e Lista, e filtrar tarefas',
        passos: [
          'Use os botões "Kanban" e "Lista" para trocar a forma de visualizar as tarefas.',
          'Filtre por responsável, status ou prazo para encontrar mais rápido o que procura, em qualquer uma das duas visões.',
        ],
        imagem: { chave: 'tarefas-visao-filtro', legenda: 'Botões de alternar entre Kanban e Lista, com o filtro de tarefas aberto' },
      },
      {
        titulo: 'Selecionar várias tarefas e excluir',
        passos: [
          'Marque as tarefas desejadas na lista.',
          'Escolha entre excluir apenas as tarefas marcadas desta página ou todas as que passam pelo filtro atual, da mesma forma que acontece em Negócios.',
          'Confirme a exclusão no aviso que aparece na tela, lendo com atenção quantas tarefas serão afetadas antes de confirmar.',
        ],
        imagem: { chave: 'tarefas-excluir-em-massa', legenda: 'Seleção de várias tarefas com o botão de excluir em massa' },
      },
      {
        titulo: 'Tarefa criada a partir de uma conversa do WhatsApp',
        passos: [
          'Dentro de uma conversa do WhatsApp, existe a opção de criar uma tarefa já com o texto da mensagem selecionada preenchido na descrição.',
          'Depois de criada, essa tarefa aparece normalmente aqui em Tarefas, junto com as demais; a origem no WhatsApp é só um atalho para criar mais rápido, sem digitar tudo de novo.',
        ],
        imagem: { chave: 'tarefas-whatsapp', legenda: 'Opção de criar tarefa a partir de uma mensagem do WhatsApp' },
      },
    ],
  },
  {
    secaoId: 'chat',
    titulo: 'Chat interno',
    resumo: 'A conversa entre membros da equipe, separada das conversas com clientes que acontecem pelo WhatsApp.',
    topicos: [
      {
        titulo: 'Conversar em grupo ou no canal Geral',
        passos: [
          'O canal "Geral" já existe automaticamente para todo mundo da empresa; ninguém precisa criá-lo, ele reúne toda a equipe por padrão.',
          'Para um assunto específico, que não precisa envolver todo mundo, clique em "+ Novo Grupo", escolha os participantes e dê um nome ao grupo.',
          'É possível editar depois o nome e a foto tanto de um grupo criado quanto do canal Geral, adicionar novos membros a um grupo já existente, ou excluir o grupo pelo painel de detalhes.',
        ],
        imagem: { chave: 'chat-grupos', legenda: 'Painel de detalhes de um grupo do Chat, com a opção de excluir grupo' },
      },
      {
        titulo: 'Gravar áudio, responder citando e excluir uma mensagem',
        passos: [
          'Use o botão de microfone para gravar e enviar uma mensagem de voz, que aparece na conversa com um player próprio.',
          'Clique no ícone de resposta de uma mensagem para citá-la acima do seu texto novo, deixando claro a que você está respondendo.',
          'Para apagar uma mensagem que você mesmo enviou, use o menu "⋮" na bolha da mensagem e escolha "Excluir mensagem", confirmando no aviso que aparece.',
        ],
        imagem: { chave: 'chat-audio-responder', legenda: 'Mensagem citada (reply) numa conversa do Chat, com o player de áudio de outra mensagem' },
      },
      {
        titulo: 'Ver quem já leu, limpar a conversa e pré-visualizar anexos',
        passos: [
          'Clique no horário ou no status de uma mensagem sua para abrir o painel lateral com a lista de quem já leu.',
          'Use "Limpar chat" no cabeçalho da conversa para apagar o histórico daquele canal ou DM só para você.',
          'Arraste um arquivo direto para a área da conversa para anexá-lo, sem precisar clicar no clipe primeiro. PDF, planilha e documento do Word abrem numa prévia dentro do próprio chat antes de decidir baixar.',
          'A busca de mensagens (ícone de lupa) navega entre "resultado anterior" e "próximo resultado", não é só uma busca simples.',
        ],
        imagem: { chave: 'chat-leitura-anexos', legenda: 'Painel de "visto por" aberto numa conversa do Chat, com a prévia de um anexo' },
      },
    ],
  },
  {
    secaoId: 'whatsapp',
    titulo: 'WhatsApp',
    resumo: 'A caixa de entrada do WhatsApp da empresa, reunindo todas as conversas com clientes e possíveis clientes (leads) em um só lugar.',
    topicos: [
      {
        titulo: 'Responder e organizar uma conversa',
        passos: [
          'Escolha a conversa na lista à esquerda e responda pelo campo de mensagem, do mesmo jeito que num WhatsApp comum.',
          'Use os ícones que aparecem ao lado de cada mensagem para reagir com um emoji, responder citando a mensagem original, encaminhar para outra conversa ou fixar no topo da conversa.',
          'Uma mensagem já enviada por você pode ser editada depois, corrigindo só o texto (não é possível trocar o anexo nem a citação de uma mensagem editada).',
          'Numa conversa de grupo, digite "@" para mencionar um participante específico, com sugestão automática de nomes.',
          'Defina quem, na equipe, é o responsável pelo atendimento daquela conversa específica, o que ajuda a saber quem deve continuar a interação.',
        ],
        imagem: { chave: 'whatsapp-responder', legenda: 'Conversa de WhatsApp de exemplo aberta, com o campo de responsável em destaque' },
      },
      {
        titulo: 'Transformar uma conversa em cadastro',
        passos: [
          'Numa conversa de um número que ainda não está cadastrado, use a opção "Criar contato" para começar um cadastro de cliente a partir dos dados dessa conversa. O sistema já avisa quando aquele telefone bate com um contato ou cliente que já existe, para evitar duplicidade.',
          'Se a pessoa já existe no cadastro do sistema, use "Vincular a contato existente": o diálogo também oferece atualizar o telefone salvo no cadastro pelo número dessa conversa.',
          'Se um vínculo foi feito por engano, use "Desvincular conversa" para desfazer a ligação entre a conversa e o contato ou cliente.',
          'Em qualquer ficha de cliente ou contato do CRM, o botão "Ver conversa" leva direto para o WhatsApp dessa pessoa, quando existir.',
        ],
        imagem: { chave: 'whatsapp-transformar-cadastro', legenda: 'Diálogo de criar contato a partir de uma conversa de WhatsApp' },
      },
      {
        titulo: 'Enviar figurinha e cartão de contato',
        passos: [
          'Abra o painel de figurinhas para mandar uma já usada nesse número, ou converter uma imagem nova em figurinha antes de enviar. Quem tem permissão também pode apagar figurinhas da grade compartilhada.',
          'Uma figurinha recebida do cliente pode ser salva para reutilização, pelo menu da própria mensagem.',
          'Use "Enviar contato" para escolher um ou mais contatos do CRM e mandá-los como cartão de contato pelo WhatsApp. Quando o cliente manda um cartão de contato para você, é possível salvar aquela pessoa direto no cadastro.',
        ],
        imagem: { chave: 'whatsapp-figurinha-contato', legenda: 'Painel de figurinhas aberto numa conversa de WhatsApp' },
      },
      {
        titulo: 'Notas internas',
        passos: [
          'Crie uma nota interna, em branco ou a partir de uma mensagem, para deixar um registro visível só para a equipe. Ela nunca é enviada ao cliente pelo WhatsApp.',
          'Uma nota importante pode ser fixada no início da conversa, para não se perder no meio do histórico.',
        ],
        aviso: 'Não confunda com "fixar mensagem": aquilo é sobre uma mensagem trocada com o cliente; a nota interna é conversa só da equipe.',
        imagem: { chave: 'whatsapp-notas-internas', legenda: 'Uma nota interna fixada no topo de uma conversa de WhatsApp' },
      },
      {
        titulo: 'Criar uma tarefa a partir de uma mensagem',
        passos: [
          'Selecione a mensagem relevante e escolha a opção de criar tarefa a partir dela.',
          'O texto da mensagem já vem preenchido automaticamente na descrição da tarefa, bastando ajustar o responsável e o prazo.',
        ],
        aviso:
          'Mensagens enviadas fora do sistema, direto do celular ou pelo WhatsApp Web, aparecem marcadas de um jeito diferente na conversa. Nesses casos não há como identificar exatamente qual pessoa da equipe as enviou.',
        imagem: { chave: 'whatsapp-criar-tarefa', legenda: 'Opção de criar tarefa a partir de uma mensagem do WhatsApp' },
      },
      {
        titulo: 'Exportar ou excluir conversas em massa',
        passos: [
          'Dentro de uma conversa aberta, use "Exportar conversa" para baixar o histórico em PDF, Excel ou Markdown.',
          'Na lista de conversas, ative o modo de seleção múltipla para exportar ou excluir várias conversas de uma vez.',
        ],
        imagem: { chave: 'whatsapp-exportar-excluir', legenda: 'Seleção múltipla de conversas de WhatsApp, com as opções de exportar e excluir' },
      },
    ],
  },
  {
    secaoId: 'emails',
    titulo: 'E-mail',
    resumo: 'A caixa de e-mail da empresa, integrada diretamente ao sistema, sem precisar abrir outro programa.',
    topicos: [
      {
        titulo: 'Escrever e organizar e-mails',
        passos: [
          'Clique em "Escrever" para começar um e-mail novo, preenchendo destinatário, assunto e corpo do texto.',
          'Anexe arquivos usando o botão próprio do compositor, com prévia e remoção individual de cada anexo antes de enviar.',
          'A assinatura padrão entra automaticamente, mas pode ser removida ou reincluída só naquele e-mail específico, sem afetar a configuração geral.',
          'Use as abas Recebidos, Enviados e Rascunhos para navegar entre as diferentes categorias de mensagens. Um rascunho pode ser descartado direto na lista ou dentro do próprio compositor.',
          'Para organizar mensagens em pastas ou marcadores, é preciso primeiro ligar o "modo arrastar"; com ele ativado, basta arrastar o e-mail até a pasta desejada. Sem o modo arrastar, o mesmo resultado sai por um diálogo de escolha de marcador.',
        ],
        imagem: { chave: 'emails-escrever', legenda: 'Compositor de e-mail aberto, com anexo e a assinatura visível' },
      },
      {
        titulo: 'Marcar como não lido e excluir e-mails em massa',
        passos: [
          'Use o botão de marcar como não lido tanto na lista quanto dentro do e-mail já aberto, para lembrar de voltar nele depois.',
          'Selecione vários e-mails na lista para excluí-los de uma vez.',
        ],
        imagem: { chave: 'emails-nao-lido-massa', legenda: 'Lista de e-mails com seleção múltipla e o botão de excluir em massa' },
      },
      {
        titulo: 'Marcadores do Gmail',
        passos: [
          'Use "Criar marcador" para adicionar um rótulo novo direto na caixa conectada (Gmail). A cor é decidida pelo próprio Gmail, não há escolha de cor no CRM.',
          'Use "Mover para marcador" quando quiser organizar um e-mail sem arrastar, escolhendo o marcador num diálogo.',
        ],
        imagem: { chave: 'emails-marcadores', legenda: 'Diálogo de criar marcador do Gmail, dentro da tela de E-mail' },
      },
      {
        titulo: 'Responder ou excluir só uma mensagem dentro de uma conversa',
        passos: [
          'Numa conversa de e-mail com várias trocas, use "Focar esta mensagem" para responder ou excluir apenas aquela mensagem específica, sem afetar a conversa inteira.',
        ],
        imagem: { chave: 'emails-focar-mensagem', legenda: 'Opção de focar uma mensagem dentro de uma conversa de e-mail longa' },
      },
      {
        titulo: 'Sincronizar e conectar uma caixa',
        passos: [
          'Use o botão "Sincronizar" se um e-mail recente que você sabe que chegou ainda não estiver aparecendo na lista.',
          'Para conectar uma nova caixa de e-mail (por exemplo, uma conta do Gmail), use o card de conexão que aparece dentro desta mesma tela, seguindo o passo a passo de autorização.',
        ],
        aviso: 'A assinatura que aparece automaticamente no rodapé dos seus e-mails enviados é editada em Configurações, não nesta tela.',
        imagem: { chave: 'emails-sincronizar', legenda: 'Card de conectar caixa de e-mail e o botão de sincronizar' },
      },
    ],
  },
  {
    secaoId: 'configuracoes',
    titulo: 'Configurações',
    resumo: 'A conta, a equipe, as permissões e as automações da empresa, tudo reunido em abas.',
    topicos: [
      {
        titulo: 'Perfil e empresa',
        passos: [
          'Na aba "Perfil", troque seu nome, e-mail de acesso, senha ou o tema visual do sistema (claro, escuro ou seguindo o sistema operacional).',
          'Ao trocar a foto de perfil, um recorte se abre antes de salvar, para ajustar o enquadramento.',
          'Ligue ou desligue o som de notificação e escolha entre vários sons disponíveis, incluindo uma categoria própria da Repply.',
          'Na aba "Empresa", visível para quem tem acesso de gestor, ajuste dados cadastrais da empresa e envie a logo usada tanto no cabeçalho dos PDFs exportados quanto na assinatura de e-mail.',
        ],
        imagem: { chave: 'configuracoes-perfil', legenda: 'Aba Perfil, com o recorte de avatar e o card de som de notificação' },
      },
      {
        titulo: 'Editar o menu lateral',
        passos: [
          'Na aba Perfil, entre no modo de edição da sidebar para reorganizar, ocultar ou adicionar atalhos ao seu menu pessoal.',
          'Um gestor pode salvar o arranjo como padrão para toda a empresa, em vez de só para a própria conta.',
          'O histórico de versões do menu padrão da empresa fica disponível para o gestor consultar e restaurar uma versão anterior, se precisar.',
        ],
        imagem: { chave: 'configuracoes-menu-lateral', legenda: 'Modo de edição do menu lateral, com itens sendo reorganizados' },
      },
      {
        titulo: 'Usuários e permissões',
        passos: [
          'Na aba "Usuários", cadastre cada pessoa da equipe e defina, para cada seção do sistema, o que ela pode ver, criar, editar ou excluir.',
          'Para não repetir a mesma configuração pessoa por pessoa, crie um "preset" de permissão (um conjunto de regras pronto) e aplique esse preset a quantas pessoas precisarem exatamente daquele perfil de acesso.',
          'O código de acesso da empresa permite que novas pessoas entrem sem precisar de convite por e-mail; ele pode ser regenerado quando quiser invalidar o anterior.',
          'É possível filtrar a lista de usuários por período de cadastro.',
        ],
        aviso: 'Algumas ações desta aba, como restaurar um usuário removido, dependem do seu nível de acesso, e podem não aparecer para todo gestor.',
        imagem: { chave: 'configuracoes-usuarios', legenda: 'Matriz de permissões de um usuário de exemplo' },
      },
      {
        titulo: 'Automação',
        passos: [
          'Nesta aba fica o número de dias parado que faz um negócio entrar na pauta da tela "Hoje", ajustável conforme o ritmo comercial da empresa.',
          'Também é aqui que se liga ou desliga o envio de um resumo diário da pauta por e-mail, para quem quiser acompanhar sem precisar abrir o sistema.',
        ],
        imagem: { chave: 'configuracoes-automacao', legenda: 'Aba Automação, com o campo de dias parado da pauta' },
      },
      {
        titulo: 'WhatsApp, campos e assinatura',
        passos: [
          'A aba de WhatsApp cadastra os números (instâncias) usados pela empresa: conectar por QR Code, reconectar, desconectar, sincronizar o status e dar um nome e uma cor de identificação a cada número, útil quando há mais de um.',
          'A aba de Campos permite adicionar campos personalizados aos formulários do sistema, para registrar informações específicas do negócio da empresa que não existem por padrão.',
          'A assinatura que aparece automaticamente no rodapé dos e-mails enviados pela equipe é editada aqui.',
        ],
        aviso: 'Nem toda aba aparece para todo mundo: algumas dependem do cargo ou da permissão específica de quem está com a sessão aberta.',
        imagem: { chave: 'configuracoes-whatsapp-campos', legenda: 'Aba WhatsApp de Configurações, com um número conectado por QR Code' },
      },
      {
        titulo: 'Assinatura e pagamento',
        passos: [
          'Na aba "Assinatura", veja o plano atual da empresa e troque de plano quando precisar.',
          'Para cancelar, o sistema primeiro pede o motivo da saída (isso nunca bloqueia o cancelamento) e só depois abre o portal de pagamento para concluir.',
        ],
        imagem: { chave: 'configuracoes-assinatura', legenda: 'Aba Assinatura, com o plano atual e o botão de trocar de plano' },
      },
      {
        titulo: 'Excluir a própria conta',
        passos: [
          'Na "Zona de Perigo" da aba Perfil, é possível excluir permanentemente a própria conta.',
          'A exclusão é irreversível e remove também os dados associados, como clientes, negócios e obras cadastrados por você.',
        ],
        aviso: 'Não existe como desfazer depois de confirmar. Pense duas vezes antes desta ação.',
        imagem: { chave: 'configuracoes-excluir-conta', legenda: 'Zona de Perigo da aba Perfil, com o botão de excluir conta' },
      },
    ],
  },
];
