# Journal de décisions : fine-tuning avant/après

Mis à jour à chaque arbitrage, pas à la fin. Le journal de conception du harnais
d'origine est dans `docs/DECISIONS.md`.

Format de chaque entrée : date, décision, options écartées, raison, ce qui me
ferait changer d'avis. Statut : PROPOSÉE (en attente de Thomas) ou ACTÉE.

---

## D1. Benchmark réel : Spider 1.0
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : Spider 1.0 (Yu et al., 2018), licence CC BY-SA 4.0, vérifiée sur
  https://yale-lily.github.io/spider le 2026-09-28.
- Écartées : BIRD (CC BY-SA 4.0 aussi) ; un jeu maison.
- Raison : le test set de Spider est public (depuis 2024), ce qui permet une
  évaluation finale sur des bases jamais vues. BIRD : test set non public
  (soumission par email), et 33,4 Go de bases pour 34 Go libres sur la machine.
  Les splits Spider sont par base de données (cross-database), ce qui rend la
  séparation train/eval vérifiable au niveau `db_id`.
- Changerait d'avis si : Spider s'avère saturé pour le modèle de base (baseline
  très haute, peu de marge), ou si Thomas veut un chiffre sur BIRD dev pour sa
  difficulté (possible plus tard sur dev seul, si l'espace disque le permet).

## D2. Le synthétique est complété, pas remplacé
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : garder le benchmark DuckDB synthétique et ses tests ; Spider est
  ajouté à côté.
- Écartée : supprimer le synthétique.
- Raison : il porte les pièges métier et le mutation testing qui valident le
  comparateur. Le supprimer retirerait des tests qui prouvent quelque chose.
- Changerait d'avis si : sa maintenance gêne l'extension (peu probable).

## D3. Exécution du SQL Spider dans SQLite, pas DuckDB
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : exécuteur SQLite (`node:sqlite`, vérifié fonctionnel sous Node
  22.23.1), bases ouvertes en lecture seule, requête dans un worker avec timeout.
- Écartées : attacher les bases SQLite dans DuckDB ; traduire le gold en DuckDB.
- Raison : le gold Spider est écrit en dialecte SQLite. L'exécuter ailleurs
  changerait des résultats gold et fausserait la mesure dans les deux sens.
- Changerait d'avis si : `node:sqlite` pose un problème bloquant (alors
  `better-sqlite3`, même moteur).

## D4. Modèle de base : Qwen2.5-Coder-1.5B-Instruct
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : Qwen2.5-Coder-1.5B-Instruct, licence Apache 2.0 (vérifiée sur la
  fiche Hugging Face le 2026-09-28).
- Écartées : Qwen2.5-Coder-3B-Instruct (licence "qwen-research", pas Apache :
  gênant pour un livrable montré à des employeurs) ; 0.5B (gardé en repli si
  l'entraînement est trop lent) ; 7B (plus de marge absolue mais entraînement
  plus long et moins "petit modèle").
- Raison : taille réellement petite, licence permissive, orienté code, tient
  largement en 48 Go pour un LoRA sous MLX.
- Changerait d'avis si : la baseline est déjà trop haute (marge faible) ou
  trop basse pour que le format de sortie soit exploitable.

## D5. Ensembles : train = Spider train, réglage = dev, verdict final = test
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : entraînement sur Spider train uniquement ; hyperparamètres et arrêt
  choisis sur dev ; test évalué une fois par modèle final (base et fine-tuné).
- Écartée : tout évaluer sur dev (standard dans la littérature, mais dev sert
  alors aussi au réglage : fuite indirecte).
- Raison : séparation stricte. Contrôle de fuite automatisé sur `db_id`,
  questions normalisées et SQL normalisés, résultat publié.
- Précision (2026-09-28) : dev est coupé en deux, 200 items fixes (graine
  20260928) pour la perte de validation pendant l'entraînement, et les 834
  autres ("dev de sélection") pour choisir la config par justesse d'exécution.
  Même la baseline n'est PAS lancée sur le test avant que le modèle final soit
  choisi : aucun chiffre du test ne peut influencer un choix.
- Changerait d'avis si : Thomas préfère un chiffre dev comparable à la
  littérature ; on publierait alors les deux, en le disant.

## D6. Définition de la métrique de justesse
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : justesse d'exécution = le comparateur existant (`compareResultSets`)
  sur les résultats du SQL prédit et du SQL gold exécutés sur la même base.
  `ordered` = vrai si le gold contient `ORDER BY`. Toute la définition reste
  celle de `docs/DECISIONS.md` (position des colonnes sémantique, multiset,
  tolérance flottante 1e-6).
- Contre-vérification : évaluateur officiel Spider en mode exécution, publié à
  côté. Si non faisable : "non mesuré".
- Écartée : exact-match du SQL (pénalise des requêtes justes écrites
  autrement).
- Changerait d'avis si : la divergence avec l'officiel est forte et vient d'un
  défaut de notre comparateur (alors on corrige le comparateur, avec test).

## D7. Requêtes ambiguës sur Spider
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : Spider n'étiquette aucune question comme ambiguë. Toutes sont
  traitées comme répondables ; une abstention compte comme échec. La catégorie
  `ambiguous_question` reste réservée au benchmark synthétique.
- Écartée : étiqueter à la main des questions "ambiguës" dans Spider (subjectif,
  non reproductible, et modifierait le benchmark public).
- Changerait d'avis si : on relève beaucoup de gold manifestement ambigus ; on
  les listerait alors en annexe, sans changer le score.

## D8. Format de prompt unique, généré en TypeScript
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : le schéma (CREATE TABLE lus dans la base SQLite) + la question
  -> SQL brut. Le même code TS construit le prompt d'éval et écrit le JSONL
  d'entraînement lu par mlx-lm.
- Écartées : sortie JSON avec confiance (peu fiable sur un 1,5B) ; deux
  implémentations TS et Python du prompt (risque de dérive).
- Changerait d'avis si : mlx-lm impose un format que TS ne peut pas produire
  proprement.

## D9. Confiance
- Date : 2026-09-28. Statut : ACTÉE (mise à jour après vérification).
- Vérifié le 2026-09-28 : `mlx_lm.server` 0.31.3 renvoie `logprobs` par token
  via le client `openai` (paramètres `logprobs: true, top_logprobs: 1`), ainsi
  que `usage` (tokens prompt et complétion).
- Décision : confiance = exp(moyenne des logprobs des tokens générés). C'est une
  probabilité du modèle sur sa propre sortie, PAS une confiance calibrée. Le
  rapport l'appelle "probabilité moyenne par token" et publie confiance moyenne
  juste/faux et la part d'erreurs au-dessus de 0,75, avec cette réserve.
- Écartée : confiance auto-déclarée en JSON (sans valeur sur un 1,5B, et
  imposerait un format de sortie différent de l'entraînement).
- Observé : les logprobs renvoyés semblent grossièrement quantifiés (valeurs
  comme 0 et -0,125 sur le premier essai). Non investigué ; si cela rend le
  signal inutilisable, on l'écrit.
- Changerait d'avis si : le signal ne sépare pas du tout juste et faux (on le
  publiera comme tel, c'est un résultat).

## D10. Données et poids hors git
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : Spider, JSONL d'entraînement, adaptateurs et modèle fusionné sont
  gitignorés. Seuls le code, les rapports et les résultats par question
  (identifiants + verdicts) sont committés.
- Raison : taille, et CC BY-SA 4.0 est share-alike ; publier des poids dérivés
  est une décision de Thomas.

## D11. Hyperparamètres LoRA : configuration A d'abord, une variante au plus
- Date : 2026-09-28. Statut : ACTÉE (config A) ; variante décidée sur dev.
- Config A (`finetune/lora-a.yaml`) : valeurs par défaut de mlx-lm 0.31.3 pour
  le LoRA (rang 8, scale 20, dropout 0, 16 derniers blocs sur 28, Adam,
  lr 1e-5), écrites en clair ; batch 4 ; 1 époque = 2148 itérations ; perte
  masquée sur le prompt ; max_seq_length 2048 (plus long exemple mesuré : 1929
  tokens avec le chat template, donc aucune troncature) ; graine 0.
- Pourquoi les défauts : ce sont des valeurs éprouvées sur ce code, et je n'ai
  pas de mesure qui justifie d'autres valeurs. Choisir "au feeling" un rang ou
  un lr, c'est un réglage non traçable.
- Budget de réglage, dit honnêtement : une passe dev complète (834 questions)
  prend environ 40 minutes, donc pas de grille. Au plus UNE variante, choisie
  d'après la courbe de perte de A (lr 5e-5 si la perte de validation descend
  encore franchement en fin d'époque, sous-apprentissage probable ; arrêt plus
  tôt si elle remonte). Le choix entre A et la variante se fait sur la justesse
  d'exécution du dev de sélection, jamais sur le test.
- Écartés : DoRA et full fine-tune (plus coûteux, pas le sujet) ; QLoRA 4 bits
  (voir D14).
- Changerait d'avis si : A dégrade la justesse sur dev ; on documente la
  dégradation, puis on essaie la variante.

## D12. Doublons textuels train/eval : retirés de l'entraînement
- Date : 2026-09-28. Statut : ACTÉE.
- Constat (mesuré le 2026-09-28 sur spider_data.zip, sha256 00636695...121b) :
  0 base partagée entre train (train_spider + train_others), dev et test. Mais
  52 items de test et 11 de dev ont une question ou un SQL identique (après
  minuscules et espaces normalisés) à un exemple d'entraînement, sur une AUTRE
  base. Exemple : "How many clubs are there?" / `SELECT count(*) FROM club` sur
  club_1 (train) et soccer_3 (test). 69 exemples d'entraînement sont concernés.
- Décision : retirer ces 69 exemples du jeu d'entraînement. Le test reste
  intact (2147 items) donc comparable à l'évaluateur officiel.
- Écartées : les garder (fuite textuelle, même si la base diffère) ; les
  retirer du test (le test ne serait plus le test Spider standard).
- Coût : 69 / 8659 exemples d'entraînement, soit 0,8 %.
- Limite assumée : seuls les doublons EXACTS sont retirés. Les quasi-doublons
  (paraphrases, "Count the number of clubs." vs "Count the total number of
  clubs.") restent. C'est une propriété connue de Spider, écrite dans le rapport.
- Changerait d'avis si : un contrôle de quasi-doublons (similarité) montrait un
  recouvrement massif ; on mesurerait alors aussi la justesse sur le
  sous-ensemble sans quasi-doublon.

## D13. Gold à résultat vide : signalé et isolé dans le rapport
- Date : 2026-09-28. Statut : ACTÉE.
- Constat : les 2147 gold du test s'exécutent sans erreur sous sqlite3 (Python,
  lecture seule). 54 renvoient un résultat VIDE.
- Décision : garder ces items (c'est le benchmark), mais publier aussi la
  justesse sur le sous-ensemble à gold non vide, car une requête fausse qui
  renvoie vide y est comptée juste par construction.
- Écartée : les retirer silencieusement.

## D14. Modèle servi en bf16, révision figée, adaptateur servi sans fusion
- Date : 2026-09-28. Statut : ACTÉE.
- Décision : Qwen/Qwen2.5-Coder-1.5B-Instruct, révision Hugging Face
  `2e1fd397ee46e1388853d2af2c993145b0f1098a` (licence apache-2.0 relue dans les
  métadonnées), poids bf16 (3,1 Go), servis par `mlx_lm.server` 0.31.3
  (mlx 0.32.2). Le fine-tuné est servi avec `--adapter-path`, même serveur,
  même poids de base.
- Écartées : versions quantifiées 4 bits (mélangerait l'effet de la
  quantification et celui du fine-tune) ; fusion des poids (une étape de plus,
  inutile puisque le serveur charge l'adaptateur).
- Décodage : glouton (temperature 0), max_tokens 512, requêtes séquentielles
  (pas de concurrence) pour une latence propre. Une réponse tronquée
  (finish_reason = length) est comptée et publiée.
- Changerait d'avis si : la latence de l'adaptateur non fusionné diffère
  sensiblement ; on mesurerait alors aussi le modèle fusionné.

## D15. Littéraux entre guillemets doubles acceptés (comme l'évaluateur officiel)
- Date : 2026-09-28. Statut : ACTÉE.
- Incident : le premier contrôle d'intégrité avec l'exécuteur du harnais a
  trouvé 406 gold en erreur sur 2147 (test) et 213 sur 1034 (dev), contre 0 avec
  le sqlite3 de Python. Cause : Spider écrit des chaînes entre guillemets
  doubles (`WHERE name = "Mars"`). Le SQLite embarqué dans Node (3.51.3) les
  refuse par défaut ; le sqlite3 de Python (3.51.0) les accepte.
- Décision : `enableDoubleQuotedStringLiterals: true` dans l'exécuteur. Après
  correction : 0 erreur de gold, 54 gold vides sur test, 49 sur dev, identique
  au contrôle Python pour le test. Un test l'exige et a été vu rouge sans
  l'option.
- Raison : l'évaluateur officiel Spider tourne sur le sqlite3 de Python. Sans
  l'option, un cinquième du gold aurait été non notable, et une prédiction
  écrite dans le style de Spider aurait été comptée fausse.
- Effet de bord assumé : un identifiant mal écrit entre guillemets doubles peut
  être lu comme une chaîne au lieu de lever "no such column". Même règle avant
  et après, et c'est le comportement de l'évaluateur officiel.

## D16. Contre-vérification par l'évaluateur officiel, verdict par item
- Date : 2026-09-28. Statut : ACTÉE.
- Outil : taoyds/test-suite-sql-eval, licence Apache 2.0 (fichier LICENSE lu),
  commit e97acc5, mode `exec` sur les bases Spider standard (pas les bases
  "test suite" distillées). Dépendances figées : tqdm 4.67.1, sqlparse 0.5.3,
  nltk 3.9.1 (+ ressource punkt_tab). Lancé par `scripts/official_eval.py`, qui
  sort aussi un verdict PAR ITEM et la difficulté officielle (easy, medium,
  hard, extra), avec les fonctions de l'évaluateur lui-même. La moyenne par item
  est vérifiée égale au total imprimé par l'évaluateur (134/213 = 0,629 sur le
  premier essai partiel).
- Constat sur 213 items de la baseline dev : l'officiel n'est jamais plus strict
  que notre comparateur ; 8 items sont justes pour lui et faux pour nous, tous
  expliqués par ses deux tolérances documentées : colonnes permutées
  (`SELECT PetType, AVG(weight)` vs gold `avg(weight), pettype`) et `DISTINCT`
  retiré des deux côtés (option par défaut, désactivable par --keep_distinct).
- Décision : notre comparateur reste la métrique principale (D6, inchangée). Le
  chiffre officiel est publié à côté, avant ET après, avec le nombre d'items où
  les deux divergent. Aucun des deux ne sert à choisir celui qui arrange.
- Changerait d'avis si : l'officiel devenait plus strict que nous sur des items
  (ce serait un défaut de notre comparateur, à corriger avec un test).

## D17. Référence API : gpt-4o-mini, même protocole, sur test
- Date : 2026-09-28. Statut : ACTÉE (feu vert de Thomas le 2026-09-28).
- Décision : gpt-4o-mini (snapshot par défaut gpt-4o-mini-2024-07-18) évalué
  avec EXACTEMENT le même prompt, la même extraction, le même exécuteur et le
  même comparateur, sur le test uniquement. Il sert d'échelle, pas de cible : on
  ne règle rien sur lui.
- Prix vérifié le 2026-09-28 sur developers.openai.com : 0,15 $ par million de
  tokens en entrée, 0,60 $ en sortie. Coût estimé avant lancement : environ
  0,12 $ pour le test (estimation sur le tokenizer Qwen, marge ±30 %). Le coût
  publié est recalculé sur les tokens facturés renvoyés par l'API.
- Réserves écrites dans le rapport : gpt-4o-mini a très probablement vu Spider
  (publié en 2018) ; temperature 0 n'est pas strictement déterministe côté API ;
  sa latence inclut le réseau et n'est pas comparable à celle d'un modèle local.
- Clé : lue dans `.env` (gitignoré) via `--env-file-if-exists`, jamais en
  argument de ligne de commande.
