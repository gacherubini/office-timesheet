-- Migra URLs legadas do host t3.tigrisfiles.io (que não está mais
-- respondendo conexão) para o host público canônico do Tigris
-- fly.storage.tigris.dev. Aplica-se a todas as colunas que guardam
-- URLs de objetos do bucket.

UPDATE users
SET avatar_url = replace(avatar_url, '.t3.tigrisfiles.io/', '.fly.storage.tigris.dev/')
WHERE avatar_url LIKE 'https://%.t3.tigrisfiles.io/%';

UPDATE projects
SET image_url = replace(image_url, '.t3.tigrisfiles.io/', '.fly.storage.tigris.dev/')
WHERE image_url LIKE 'https://%.t3.tigrisfiles.io/%';

UPDATE expense_requests
SET receipt_url = replace(receipt_url, '.t3.tigrisfiles.io/', '.fly.storage.tigris.dev/')
WHERE receipt_url LIKE 'https://%.t3.tigrisfiles.io/%';
