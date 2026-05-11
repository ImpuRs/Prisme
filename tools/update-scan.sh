#!/bin/bash
# update-scan.sh — Merge un ZZAT CSV dans le JSON scan et push sur GitHub
# Usage: ./tools/update-scan.sh ~/Downloads/ZZAT018_22.csv
# Détecte l'agence depuis le nom du fichier (ZZAT018_XX.csv → AGXX)

set -e

CSV="$1"
if [ -z "$CSV" ]; then
  echo "Usage: ./tools/update-scan.sh <ZZAT018_XX.csv>"
  exit 1
fi

# Détecter l'agence depuis le nom du fichier
AG=$(echo "$CSV" | grep -oE '_[0-9]{2}\.' | tr -d '_.')
if [ -z "$AG" ]; then
  echo "✕ Impossible de détecter l'agence depuis le nom du fichier"
  echo "  Le fichier doit s'appeler ZZAT018_XX.csv (ex: ZZAT018_22.csv)"
  exit 1
fi

echo "→ Agence détectée : AG$AG"

# Trouver le repo et le JSON
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PRISME_DIR="$(dirname "$SCRIPT_DIR")"

# Chercher le JSON dans le bon repo
if [ -f "$PRISME_DIR/data/prisme-scan-AG${AG}.json" ]; then
  JSON="$PRISME_DIR/data/prisme-scan-AG${AG}.json"
  REPO="$PRISME_DIR"
elif [ -f "$HOME/prisme-scan${AG}/data/prisme-scan-AG${AG}.json" ]; then
  JSON="$HOME/prisme-scan${AG}/data/prisme-scan-AG${AG}.json"
  REPO="$HOME/prisme-scan${AG}"
else
  echo "✕ JSON non trouvé pour AG$AG"
  exit 1
fi

echo "→ JSON : $JSON"
echo "→ Repo : $REPO"

# Merge
node "$SCRIPT_DIR/merge-zzat.js" "$CSV" "$JSON"

# Push
cd "$REPO"
git add "data/prisme-scan-AG${AG}.json"
git commit -m "data: mise à jour stock AG$AG depuis ZZAT $(date +%d/%m/%Y)"
git push

echo ""
echo "✓ Poussé sur GitHub — les téléphones récupéreront les données au prochain refresh"
