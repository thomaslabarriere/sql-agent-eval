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
- Mise à jour 2026-09-28, baseline dev complète (834 items) : nous 504
  (60,4 %), officiel par défaut 531 (63,7 %), officiel --keep_distinct 525
  (62,9 %). L'officiel par défaut était PLUS STRICT que nous sur 4 items.
  Examinés un par un : résultats identiques au gold, mais l'officiel retire le
  DISTINCT de la prédiction, ce qui fait apparaître des doublons. Avec
  --keep_distinct : 0 item où l'officiel est plus strict, 21 où il est plus
  tolérant, tous de type `values` (colonnes permutées). Notre comparateur n'est
  donc pas en cause. Le rapport publie les trois chiffres.

## D18. Variante retenue : arrêt anticipé (checkpoint 1000), pas un lr plus fort
- Date : 2026-09-28. Statut : ACTÉE, avant toute évaluation de l'adaptateur.
- Mesures de l'entraînement A (journal `finetune/logs/lora-a.log`) : perte de
  validation 1,143 (itération 1), 0,232 (200), 0,224 (1000), minimum 0,222
  (1200), puis 0,244 en fin d'époque (2148). Perte d'entraînement finale 0,095.
  Durée 7305 s (2 h 02, CPU partagé avec le run gpt-4o-mini pendant une partie,
  voir ETAT). Pic mémoire MLX 36,2 Go ; empreinte mémoire pic du processus
  38,7 Go (`/usr/bin/time -l`).
- Lecture : plateau dès 200 itérations, légère remontée ensuite, donc pas de
  sous-apprentissage. La règle écrite en D11 AVANT l'entraînement dit : lr plus
  fort seulement si la perte descend encore ; arrêt plus tôt si elle remonte.
- Décision : deux candidats, tous deux évalués sur le dev de sélection (834) :
  `lora-a` (fin d'époque) et `lora-a-1000` (checkpoint sauvegardé à 1000,
  perte de validation 0,224, le plus proche du minimum parmi les checkpoints
  sauvegardés tous les 500). Le meilleur en justesse d'exécution sur le dev de
  sélection est le modèle final. En cas d'égalité à 1 point près, on garde le
  checkpoint 1000 (moins entraîné, perte de validation plus basse).
- Réserve : une perte de validation sur 200 items est bruitée ; les écarts de
  0,01 à 0,02 entre checkpoints ne sont pas à surinterpréter. C'est pourquoi le
  choix se fait sur la justesse d'exécution, pas sur la perte.
- Écartée : réentraîner avec lr 5e-5 (la courbe ne montre pas de
  sous-apprentissage).

## D19. INCIDENT : adaptateur jamais appliqué par le serveur ; on sert le modèle fusionné
- Date : 2026-09-28. Statut : ACTÉE.
- Constat : la première évaluation "lora-a" sur dev donnait 60,1 % contre
  60,4 % pour la base, avec seulement 56 réponses changées sur 834 et aucun
  changement de style, alors que la perte de validation avait chuté de 1,14 à
  0,23. Contradiction examinée avant toute conclusion.
- Preuve : en génération directe (`mlx_lm.load(..., adapter_path=...)`), le
  modèle adapté reproduit exactement les cibles d'entraînement (3/3 à
  l'identique, espacement Spider compris) ; le serveur lancé avec
  `--adapter-path` renvoie la sortie du modèle de base, que la requête nomme le
  modèle par son id ou par "default_model".
- Cause (lue dans `mlx_lm/server.py` 0.31.3, `ModelProvider.load`) : le nom
  "default_model" est d'abord remplacé par le chemin du modèle, puis
  l'adaptateur est cherché dans `_adapter_map` avec ce chemin remplacé, clé qui
  n'existe pas. L'adaptateur de la ligne de commande n'est donc jamais chargé,
  sans erreur ni avertissement.
- Décisions :
  1. Le fichier est renommé `results/spider/base-rerun.dev.jsonl` : c'est un
     SECOND passage du modèle de base, pas un résultat du fine-tune. Il est
     gardé parce qu'il mesure le non-déterminisme du service (même modèle, même
     prompt, décodage glouton).
  2. On sert désormais l'adaptateur FUSIONNÉ dans les poids (`mlx_lm.fuse`,
     bf16), ce qui annule la partie "servi sans fusion" de D14. Plus aucune
     dépendance au chargement d'adaptateur du serveur.
  3. Garde-fou : avant chaque évaluation, `npm run spider -- check-served`
     compare les réponses du serveur aux cibles d'entraînement sur des exemples
     d'entraînement fixes. Un modèle fine-tuné doit en reproduire la majorité à
     l'identique, le modèle de base presque aucune. Un run dont le contrôle ne
     correspond pas au modèle annoncé n'est pas lancé.
- Leçon écrite pour le rapport : sans ce contrôle, le projet aurait publié
  "le fine-tune ne change rien", un résultat faux et présentable.

## D20. Modèle final : checkpoint 1000 de la config A (fusionné)
- Date : 2026-09-29. Statut : ACTÉE, AVANT tout passage sur le test.
- Mesures sur le dev de sélection (834) : base 60,4 % ; lora-a (fin d'époque)
  67,5 % ; lora-a-1000 68,8 % (IC [65,6 ; 71,9]). lora-a-1000 contre lora-a :
  +1,3 point, 54 corrections, 43 régressions, McNemar p = 0,31, donc NON
  significatif.
- Décision : application de la règle D18 écrite avant ces mesures. lora-a-1000
  est meilleur, et l'écart est proche de la zone d'égalité où la règle le
  désignait de toute façon. Modèle final : `finetune/fused/lora-a-1000`.
- Ce qu'on NE dit PAS : que l'arrêt anticipé "améliore" le modèle. L'écart entre
  les deux checkpoints est dans le bruit (le non-déterminisme du serveur seul
  fait changer 13 verdicts sur 834).
- Test : un seul passage pour la base et un seul pour lora-a-1000, lancés par
  `scripts/run-final-test.sh`, sans autre charge sur la machine (latences
  publiées). lora-a (fin d'époque) n'est PAS évalué sur le test.

## D21. Langue : rapport et README en anglais, journaux en français
- Date : 2026-09-29. Statut : ACTÉE.
- Décision : le README, `docs/FINETUNE-REPORT.md` et les tableaux générés par
  `npm run spider -- report` sont en anglais, comme le reste du repo (README et
  docs existants). DECISIONS.md et ETAT.md restent en français : ce sont les
  documents de travail de Thomas.
- Changerait d'avis si : Thomas veut une version française du rapport pour une
  candidature précise (à produire depuis les mêmes fichiers de résultats).

## D22. Correction de D10 : les résultats committés contiennent du texte Spider
- Date : 2026-09-29. Statut : ACTÉE.
- Constat : D10 disait que seuls identifiants et verdicts seraient committés.
  En réalité les fichiers `results/spider/*.jsonl` contiennent aussi la
  question et le SQL gold de Spider (et `gold-check.*.json` des identifiants).
  C'est une redistribution de contenu CC BY-SA 4.0.
- Décision : les garder, car sans eux les régressions publiées ne sont pas
  vérifiables par un tiers. Ajout de `results/spider/DATA-LICENSE.md` :
  attribution, citation, et licence CC BY-SA 4.0 pour ces fichiers (distincte
  de la licence MIT du code).
- Toujours hors git : bases SQLite, JSONL d'entraînement, adaptateurs, modèles
  fusionnés.
- Vérifié ? La licence CC BY-SA 4.0 de Spider oui (page officielle). Que cette
  notice suffise juridiquement : NON vérifié par un juriste ; c'est la lecture
  standard de la licence (attribution + même licence).
