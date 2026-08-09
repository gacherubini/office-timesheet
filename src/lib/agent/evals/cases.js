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
]
