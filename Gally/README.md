# Gally — assistant vendeur

Chat de recherche d'articles hébergé par Apps Script. Le moteur est déterministe :
l'IA ne choisit jamais un article.

| Fichier | Rôle |
|---|---|
| `Code.gs` | Moteur (identifiant exact, puis mots-clés + ALIAS), page web `doGet`, tests, Gemini optionnel |
| `Chat.html` | Page de chat (fichier HTML nommé `Chat` dans le projet Apps Script) |
| `tests/TESTS.csv` | Questions réelles et réponse attendue |
| `tests/lancer-tests.js` | Rejoue les tests en local : `node Gally/tests/lancer-tests.js ARTICLES.csv` |

La base `ARTICLES.csv` (61 Mo, prix) n'est pas versionnée.
