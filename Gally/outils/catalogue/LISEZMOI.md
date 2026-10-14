# Texte du catalogue papier → colonne CATALOGUE

Le PDF « enrichi » du catalogue contient un lien `legallais.com/article/<code>` sur chaque code.
On s'en sert pour rattacher à chaque code le texte placé autour de lui sur sa page :
en-tête de page, titre produit, sous-titre, titre de tableau, tête de colonne, texte de sa ligne.

1. `python3 extraire_pages.py catalogue.pdf 0 3178 pages.jsonl` (pdfplumber ; découper en 4 tranches pour aller 4× plus vite)
2. `python3 rattacher.py rattachement_plomberie.json pages*.jsonl` (un fichier par catalogue)
3. `node fusionner.js ARTICLES.csv ARTICLES_catalogue.csv "Second œuvre=rattachement_so.json" "Plomberie=rattachement_plomberie.json" "Maintenance=rattachement_maintenance.json"`
   → réimporter dans l'onglet ARTICLES. La page affichée vient du premier catalogue de la liste qui contient l'article.

Le moteur lit la colonne 16 si elle existe : un mot trouvé dans le texte du catalogue vaut 1 (comme la famille),
dans la désignation 2. La fiche affiche la page du catalogue (catalogue et folio imprimé, ex. « Second œuvre p. BA 273 »).
