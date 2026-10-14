# Texte du catalogue papier → colonne CATALOGUE

Le PDF « enrichi » du catalogue contient un lien `legallais.com/article/<code>` sur chaque code.
On s'en sert pour rattacher à chaque code le texte placé autour de lui sur sa page :
en-tête de page, titre produit, sous-titre, titre de tableau, tête de colonne, texte de sa ligne.

1. `python3 extraire_pages.py catalogue.pdf 0 3178 pages.jsonl` (pdfplumber ; découper en 4 tranches pour aller 4× plus vite)
2. `python3 rattacher.py rattachement.json pages*.jsonl`
3. `node fusionner.js ARTICLES.csv rattachement.json ARTICLES_catalogue.csv` → réimporter dans l'onglet ARTICLES

Le moteur lit la colonne 16 si elle existe : un mot trouvé dans le texte du catalogue vaut 1 (comme la famille),
dans la désignation 2. La fiche affiche la page du catalogue (folio imprimé, ex. « BA 273 »).
