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
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : pas de confiance auto-déclarée pour le modèle local. Logprob moyen
  des tokens si `mlx_lm.server` le fournit (à vérifier), sinon "non mesuré" et
  le quadrant confiance x justesse n'est pas publié pour ce run.
- Changerait d'avis si : rien, tant qu'aucun signal mesuré n'existe.

## D10. Données et poids hors git
- Date : 2026-09-28. Statut : ACTÉE (validée par Thomas le 2026-09-28).
- Décision : Spider, JSONL d'entraînement, adaptateurs et modèle fusionné sont
  gitignorés. Seuls le code, les rapports et les résultats par question
  (identifiants + verdicts) sont committés.
- Raison : taille, et CC BY-SA 4.0 est share-alike ; publier des poids dérivés
  est une décision de Thomas.

## D11. Hyperparamètres LoRA
- Date : 2026-09-28. Statut : À DÉCIDER après la baseline (réglage sur dev).

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
