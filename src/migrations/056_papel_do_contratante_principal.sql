-- 056_papel_do_contratante_principal.sql
-- O formulário de projeto tinha DOIS controles dizendo a mesma coisa na mesma
-- linha: um rádio "principal" e um Select de papel cuja primeira opção era
-- "Contratante principal". O dono do produto testou e marcou vários rádios
-- achando que era assim que se escolhem vários contratantes. Os dois viraram
-- um só — quem tem o papel `contratante_principal` É o principal, e
-- `is_primary` passou a ser derivada dele, na tela e na rota de escrita.
--
-- O problema é o que JÁ ESTÁ GRAVADO. Enquanto os dois controles eram
-- independentes, dava para salvar um INVESTIDOR marcado como principal — e
-- essa linha é perfeitamente válida para o banco (o CHECK da 045 aceita o
-- papel, o UNIQUE INDEX aceita o principal). Só que a tela nova lê o principal
-- do papel: esse projeto abriria com o seletor de papel sem nenhum
-- "Contratante principal", ou seja, sem principal nenhum aos olhos do usuário
-- — e o primeiro salvamento promoveria outra pessoa pelas costas dele.
--
-- Sentido único de propósito: `is_primary` é a coluna que os leitores antigos
-- e o UNIQUE INDEX usam, e é ela que já concorda com projects.client_id
-- (sincronizado na rota desde a 045). Então ela manda aqui, e o papel é que se
-- ajusta. O caminho contrário (promover quem tem o papel) inventaria principal
-- onde já existe um e esbarraria no UNIQUE INDEX.
--
-- Idempotente: rodar de novo não encontra mais nenhuma linha (o deploy sempre
-- roda o arquivo inteiro de novo em banco já migrado).

UPDATE project_clients
   SET role = 'contratante_principal'
 WHERE is_primary
   AND role <> 'contratante_principal';
