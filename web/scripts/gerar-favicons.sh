#!/usr/bin/env bash
# Gera os ícones da aba a partir do símbolo da marca. Rode de novo se o
# símbolo mudar; os arquivos gerados são COMMITADOS (Vite serve public/ como
# estático, não é build step).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONTE="$ROOT_DIR/src/assets/studio-vivian-simbolo.png"
SAIDA="$ROOT_DIR/public"

mkdir -p "$SAIDA"

sips -z 32 32    "$FONTE" --out "$SAIDA/favicon-32.png"       >/dev/null
sips -z 180 180  "$FONTE" --out "$SAIDA/apple-touch-icon.png" >/dev/null
sips -z 512 512  "$FONTE" --out "$SAIDA/icon-512.png"         >/dev/null

# .ico a partir do PNG de 32: o formato aceita payload PNG desde o Vista, e o
# cabeçalho são 22 bytes. Evita depender de ImageMagick só para isto.
python3 - "$SAIDA/favicon-32.png" "$SAIDA/favicon.ico" <<'PY'
import struct, sys

origem, destino = sys.argv[1], sys.argv[2]
with open(origem, 'rb') as f:
    png = f.read()

# ICONDIR: reservado=0, tipo=1 (ícone), quantidade=1
cabecalho = struct.pack('<HHH', 0, 1, 1)
# ICONDIRENTRY: 32x32, sem paleta, 1 plano, 32 bits, tamanho, offset (6+16=22)
entrada = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png), 22)

with open(destino, 'wb') as f:
    f.write(cabecalho + entrada + png)
print(f'favicon.ico gerado ({len(png) + 22} bytes)')
PY

echo "✔ ícones em $SAIDA"
