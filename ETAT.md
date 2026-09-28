# ETAT du projet fine-tuning avant/après

Dernière mise à jour : 2026-09-28. Branche locale : `finetune-spider` (rien poussé).

À lire avec `DECISIONS.md` (racine). `docs/DECISIONS.md` reste le journal de
conception du harnais d'origine, il n'est pas modifié.

## Objectif

Combler deux manques : des projets évalués uniquement sur données synthétiques,
et aucun fine-tuning ni petit modèle servi en local. Donc : benchmark text-to-SQL
public et réel, baseline mesurée, fine-tune LoRA local, réévaluation avec le même
harnais, rapport avant/après honnête.

## Fait

- [x] Lecture intégrale du repo (src, tests, docs, runs committés).
- [x] Tests existants verts : 34/34 (`npm test`, 2026-09-28). Le README annonce
      30 tests : il est périmé, à corriger.
- [x] Machine vérifiée : Apple M4 Pro, 48 Go RAM, Node 22.23.1, Python 3.11.8,
      uv, ollama présents. `mlx_lm` NON installé. Disque : 34 Go libres sur 460.
- [x] `node:sqlite` fonctionne dans Node 22.23 (avertissement "experimental").
- [x] Licences vérifiées sur les pages officielles (2026-09-28) :
      Spider 1.0 = CC BY-SA 4.0, test set public depuis 2024 ;
      BIRD = CC BY-SA 4.0, test set NON public, 33,4 Go de bases ;
      Qwen2.5-Coder-1.5B-Instruct = Apache 2.0 ;
      Qwen2.5-Coder-3B-Instruct = licence "qwen-research" (pas Apache).
- [x] Plan et risques écrits (ce fichier). Premiers arbitrages dans DECISIONS.md.
- [x] Spider téléchargé : `data/spider_data.zip`, 205 800 266 octets,
      sha256 `00636695dabed6b5f4b8328a16b13e069a2f16591d5efcce57660669c85b121b`,
      1,7 Go décompressé. Comptes vérifiés : train_spider 7000 (140 bases),
      train_others 1659 (6 bases), dev 1034 (20 bases), test 2147 (40 bases).
- [x] Pré-contrôle de fuite (Python) : 0 base partagée ; doublons textuels
      exacts trouvés et traités (D12). Gold test : 0 erreur, 54 vides (D13).

## En cours

- Plan validé par Thomas le 2026-09-28 (D1 à D10 ACTÉES). gpt-4o-mini : PAS
  lancé tant que Thomas n'a pas dit oui explicitement (coût API).
- Phase 0 faite, phase 1 (exécuteur SQLite dans le harnais) en cours.

## Bloque

- Rien de bloquant. Points à valider par Thomas listés en bas.

## Ce que j'ai appris du repo (utile pour la suite)

- Le harnais est en TypeScript. Cœur réutilisable tel quel : `compareResultSets`
  (`src/verify.ts`), `score` (`src/metrics/score.ts`), `renderReport`.
- `verify()` et `runMutations()` dépendent de la classe `Db` (DuckDB en mémoire,
  verrouillée). Les bases Spider sont en SQLite et le SQL gold est en dialecte
  SQLite : il faut un exécuteur SQLite, pas DuckDB (voir risque R1).
- `LlmSqlAgent` passe par le client `openai` avec `response_format: json_object`
  et une confiance auto-déclarée. `mlx_lm.server` expose une API compatible
  OpenAI, donc un `baseURL` suffit en principe pour servir le modèle local
  (à vérifier, R8).
- Les mutations existantes sont écrites pour le schéma synthétique
  (`'paid'`, `user_id`) : la plupart ne s'appliqueront pas au SQL de Spider.
- Détail constaté : `docs/gpt4o-run.txt` contient une ligne de kill rate au
  format d'un ancien renderer. Sans impact, à noter si on retouche ce fichier.

## Plan

Principe : on ÉTEND le harnais, on ne le remplace pas. Le benchmark DuckDB
synthétique reste (il teste le comparateur et les pièges métier) ; Spider devient
le benchmark réel à côté.

### Phase 0. Données (sans modèle)
1. Script de téléchargement Spider 1.0 avec somme de contrôle, données hors git
   (`data/`, gitignoré). Attribution CC BY-SA 4.0 dans le README.
2. Chargeur : questions + gold SQL + `db_id` pour train, dev, test.
3. Contrôle de fuite automatisé (test) : intersection des `db_id`, des questions
   normalisées et des SQL normalisés entre train et eval doit être VIDE. Le
   résultat chiffré va dans le rapport.

### Phase 1. Harnais sur SQLite
4. Interface `SqlExecutor` extraite de `Db` ; `SqliteExecutor` en lecture seule
   (`node:sqlite`), exécuté dans un worker avec timeout (une requête générée peut
   ne jamais finir, R2). Classification des erreurs SQLite (`no such column`,
   `no such table` -> schema ; `syntax error` -> syntax).
5. `verify()` passe sur l'interface, sans changer son comportement DuckDB (les 34
   tests existants doivent rester verts).
6. Chaque nouveau test est d'abord vu ROUGE contre une implémentation cassée,
   la preuve est notée dans le message de commit.
7. Mutation testing sur le gold Spider avec des mutations génériques
   (drop_where, count_distinct, left_join, break_syntax, colonne inventée
   générique) : prouve que le comparateur attrape les erreurs sur données réelles.
8. Contrôle d'intégrité du gold : exécuter tout le gold Spider eval, compter les
   requêtes gold qui échouent ou renvoient vide. Publié tel quel, rien corrigé.

### Phase 2. Baseline
9. Format de prompt unique (schéma sérialisé depuis la base SQLite + question
   -> SQL brut). Défini UNE fois en TS, et le même code écrit le JSONL
   d'entraînement : pas de dérive train/eval (R6).
10. `mlx_lm.server` avec le modèle de base, agent local via `baseURL`.
11. Run baseline sur l'ensemble d'éval : justesse d'exécution, catégorie
    d'échec, latence par requête (p50/p95), tokens/s, mémoire pic. Résultats
    par question sauvegardés en JSONL (base du diff de régressions).
12. Contre-vérification avec l'évaluateur officiel Spider (mode exécution) pour
    montrer que notre métrique ne diverge pas en notre faveur. Si non faisable :
    écrit "non mesuré".

### Phase 3. Fine-tune LoRA
13. `finetune/` en Python (uv, mlx-lm). Entraînement sur Spider train
    uniquement, perte masquée sur la réponse, validation sur une tranche de dev.
14. Hyperparamètres choisis sur dev, JAMAIS sur test. Chaque choix dans
    DECISIONS.md, avec la courbe de perte.
15. Temps d'entraînement et mémoire pic mesurés et notés.

### Phase 4. Réévaluation et rapport
16. Même harnais, même prompt, même ensemble, modèle fusionné ou base + adaptateur.
17. Rapport : tableau avant/après (justesse, par difficulté Spider, par catégorie
    d'échec, latence, coût), intervalle de confiance, test de McNemar apparié,
    liste complète des régressions (passait avant, échoue après) et des gains.
18. `docs/FINETUNE-REPORT.md` avec les commandes exactes, README mis à jour.
19. Référence optionnelle gpt-4o-mini sur le même ensemble (voir question 2).

## Risques identifiés

| # | Risque | Mitigation |
|---|--------|-----------|
| R1 | Dialecte : gold Spider en SQLite, harnais en DuckDB. Exécuter le gold dans DuckDB fausserait des résultats. | Exécuteur SQLite dédié, gold exécuté dans son moteur d'origine. |
| R2 | `node:sqlite` est synchrone, pas d'interruption : un produit cartésien généré bloque le run. | Worker thread + timeout, un timeout classé `sql_error` et compté. |
| R3 | Contamination du modèle de base : Qwen2.5-Coder a pu voir Spider en pré-entraînement. Invérifiable. | Écrit "non vérifiable" dans le rapport. Touche avant ET après, donc le delta reste interprétable, pas le niveau absolu. |
| R4 | Fuite train/eval via les hyperparamètres (réglage sur test). | Réglage sur dev uniquement, test évalué une seule fois par modèle final. Contrôle de fuite automatisé (db_id, questions, SQL). |
| R5 | Notre comparateur est plus strict que l'officiel (position des colonnes sémantique). Chiffre non comparable à la littérature. | Les deux chiffres publiés, divergence expliquée. Pas de comparaison au leaderboard sans le même évaluateur. |
| R6 | Dérive de format de prompt entre entraînement et évaluation. | Un seul code génère les deux. Test qui compare un exemple sérialisé des deux côtés. |
| R7 | Un modèle de 1,5B produit souvent du texte autour du SQL ou du JSON invalide. | Sortie SQL brute, règle d'extraction unique et identique avant/après, taux d'échec d'extraction publié. |
| R8 | `mlx_lm.server` : compatibilité exacte avec le client `openai` (json mode, logprobs) non vérifiée. | Vérifier avant de coder l'agent. La confiance auto-déclarée d'un 1,5B n'a pas de sens : logprob moyen si disponible, sinon "non mesuré". |
| R9 | Disque : 34 Go libres. BIRD (33,4 Go) ne tient pas. | Spider (quelques centaines de Mo) + modèle 1,5B (~3 Go bf16, un peu plus si fusionné). |
| R10 | Le fine-tune peut ne rien gagner ou dégrader. | Publié tel quel. Les régressions sont un livrable, pas un détail. |
| R11 | Bruit statistique : un écart de 1 à 2 points peut être du hasard. | IC 95 % et McNemar apparié. Pas de "gain" affirmé sans significativité. |
| R12 | Gold Spider possiblement imparfait (des erreurs d'annotation sont signalées dans la littérature, non mesuré ici). | Contrôle d'intégrité (étape 8), rien corrigé en silence, même gold avant et après. |
| R13 | Licences dérivées : CC BY-SA 4.0 est "share-alike". Redistribuer le JSONL d'entraînement ou les poids LoRA soulève une question de licence. | Données et poids NON committés. Publication des poids = décision de Thomas. |
| R14 | CI GitHub (Linux) ne peut pas faire tourner MLX ni télécharger Spider. | La CI garde les tests hors ligne ; les tests SQLite utilisent une mini-base créée dans le test. |
| R15 | Téléchargement Spider via Google Drive (page de confirmation, quota). | Vérifier l'URL, fallback manuel documenté si le script échoue. |

## À valider par Thomas avant de coder

1. Ensemble d'évaluation final : Spider **test** (environ 2 100 questions d'après
   mes souvenirs, NON vérifié, compté au chargement ; bases jamais vues ni en
   train ni en dev), dev servant au réglage. Recommandé.
2. Point de référence gpt-4o-mini sur le même ensemble : coût estimé à quelques dollars
   (estimation NON vérifiée, calculée sur les tokens réels avant lancement), donne une échelle ("le 1,5B local fine-tuné vs un modèle API"). Optionnel.
3. Rien n'est poussé sur GitHub (le repo est public) avant ta validation des
   chiffres.
