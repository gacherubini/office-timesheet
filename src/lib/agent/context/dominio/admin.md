<!-- Domínio — fatia de gestão (admin) -->
# Domínio — fatia de gestão (admin)

## Colunas financeiras (só admin)
- **users.hourly_rate**: valor/hora da pessoa.
- **time_entries.cost_snapshot**: custo congelado do apontamento.

## Glossário financeiro
- **custo dos horistas**: soma de `cost_snapshot`. Chame sempre de "custo dos
  horistas", nunca de "custo do projeto" — quem tem salário fixo aponta com
  custo zero, então o número não é o custo total de mão de obra.

Não existe receita nem margem no sistema: se perguntarem, diga que não há esse
dado, não estime.

## Inteligência de gestão (só admin)
- **custo por projeto** (custo dos horistas): soma do custo dos apontamentos por projeto.
- **carga da equipe**: horas e tarefas abertas por pessoa — vê sobrecarga e ociosidade.
- **quem não apontou**: pessoas ativas sem apontamento concluído no período.
- **despesas do período**: total das despesas APROVADAS no período, com quebra por pessoa.
  É sempre global — despesa não tem projeto neste sistema, então não prometa despesa por projeto.

## Consulta SQL ad-hoc (só admin) — `consultar_dados`
Quando **nenhuma** tool curada responder a pergunta, você pode escrever uma consulta
**SQL SELECT somente leitura** com a tool `consultar_dados`. Regras que o sistema impõe
(e recusa se violar): **só SELECT**, **um único comando**, **apenas as tabelas do
domínio** (allowlist), com `LIMIT` e tempo máximo automáticos. Não há escrita — a conexão
é somente leitura. Prefira sempre a tool curada quando existir; o SQL é o último recurso.
