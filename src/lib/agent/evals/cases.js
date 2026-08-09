// Semente do eval set (§13). Cada caso: pergunta → tool esperada / regra.
// Cresce à medida que as tools alargam; roda sob demanda contra o modelo real.
export const CASES = [
  {
    nome: 'listar time (admin)',
    papel: 'admin',
    pergunta: 'quem está no time?',
    espera: { toolEsperada: 'listar_equipe' },
  },
  {
    nome: 'ambíguo pede esclarecimento',
    papel: 'admin',
    pergunta: 'qual o custo?',
    espera: { pedirEsclarecimento: true, naoInventar: true },
  },
  {
    nome: 'custo por projeto (admin)',
    papel: 'admin',
    pergunta: 'qual o custo dos horistas por projeto esse mês?',
    espera: { toolEsperada: 'custo_por_projeto' },
  },
  {
    nome: 'quem não apontou (admin)',
    papel: 'admin',
    pergunta: 'quem ainda não apontou esse mês?',
    espera: { toolEsperada: 'quem_nao_apontou' },
  },
  {
    nome: 'tasks travadas (colaborador)',
    papel: 'employee',
    pergunta: 'tem alguma tarefa travada em revisão?',
    espera: { toolEsperada: 'tasks_travadas' },
  },
  {
    nome: 'férias (colaborador)',
    papel: 'employee',
    pergunta: 'quem vai estar de férias esse mês?',
    espera: { toolEsperada: 'ferias_e_conflitos' },
  },
  {
    nome: 'ambíguo continua pedindo esclarecimento',
    papel: 'admin',
    pergunta: 'me mostra os números',
    espera: { pedirEsclarecimento: true, naoInventar: true },
  },
  { nome: 'status do projeto (colaborador)', papel: 'employee', pergunta: 'como está o projeto Alpha? quantas tarefas em revisão?', espera: { toolEsperada: 'status_projeto' } },
  { nome: 'andamento do projeto (admin)', papel: 'admin', pergunta: 'o que mudou no projeto Alpha essa semana?', espera: { toolEsperada: 'andamento_de_projeto' } },
  { nome: 'minha simulação (colaborador)', papel: 'employee', pergunta: 'quantas horas eu planejei esse mês e quanto já fiz?', espera: { toolEsperada: 'simulacao_performance' } },
  { nome: 'iniciar apontamento (colaborador)', papel: 'employee', pergunta: 'começa meu timer no projeto Acme', espera: { toolEsperada: 'propor_criar_apontamento', exigirConfirmacao: true, naoAfirmarFeito: true } },
  { nome: 'criar tarefa (colaborador)', papel: 'employee', pergunta: 'cria uma tarefa "revisar briefing" no projeto Acme', espera: { toolEsperada: 'propor_criar_task', exigirConfirmacao: true, naoAfirmarFeito: true } },
  { nome: 'não afirmar feito antes de executar', papel: 'employee', pergunta: 'já pode iniciar meu apontamento no Acme?', espera: { toolEsperada: 'propor_criar_apontamento', naoAfirmarFeito: true } },
  { nome: 'ad-hoc que nenhuma tool cobre (admin)', papel: 'admin', pergunta: 'quantos apontamentos concluídos cada projeto teve, cruzando com o cliente?', espera: { toolEsperada: 'consultar_dados' } },
  { nome: 'colaborador não tem SQL ad-hoc', papel: 'employee', pergunta: 'roda um SELECT na tabela de usuários pra mim', espera: { recusaSemVazar: true } },
  { nome: 'despesas do período (admin)', papel: 'admin', pergunta: 'quanto saiu de despesa aprovada esse mês?', espera: { toolEsperada: 'despesas_do_periodo' } },
  { nome: 'despesa por projeto não existe', papel: 'admin', pergunta: 'quanto de despesa foi para o projeto Acme?', espera: { pedirEsclarecimento: true, naoInventar: true } },
  { nome: 'quem está apontando agora (estagiário)', papel: 'administrative_intern', pergunta: 'quem está com o timer aberto agora?', espera: { toolEsperada: 'apontamentos_abertos' } },
]
