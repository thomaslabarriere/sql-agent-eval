# ETAT du projet fine-tuning avant/après

Dernière mise à jour : 2026-09-29. Branche locale `finetune-spider`, NON poussée
(le repo GitHub est public : pousser = publier, décision de Thomas).

À lire avec `DECISIONS.md` (D1 à D22). Rapport : `docs/FINETUNE-REPORT.md`.
`docs/DECISIONS.md` reste le journal de conception du harnais d'origine.

## Objectif

Combler deux manques : des projets évalués uniquement sur données synthétiques,
et aucun fine-tuning ni petit modèle servi en local. Donc : benchmark text-to-SQL
public et réel, baseline mesurée, fine-tune LoRA local, réévaluation avec le même
harnais, rapport avant/après honnête.

## Où on en est : plan terminé, en attente de validation de Thomas

Tout le plan validé le 2026-09-28 est exécuté. Reste uniquement ce qui revient à
Thomas (voir "À décider par Thomas").

## Résultat final (Spider test, 2147 questions, un passage par modèle)

| | base | fine-tuné (LoRA, checkpoint 1000) | gpt-4o-mini |
|---|---|---|---|
| justesse, notre harnais | 59,2 % [57,2 ; 61,3] | 66,5 % [64,4 ; 68,4] | 73,0 % [71,1 ; 74,9] |
| officiel --keep_distinct | 62,8 % | 70,6 % | 77,9 % |
| colonnes/tables inventées | 325 | 214 | 6 |
| latence p50 / p95 | 539 / 1223 ms | 477 / 1275 ms | 945 / 1502 ms (réseau) |
| coût API | 0 $ | 0 $ | 0,129 $ (mesuré) |

Apparié base -> fine-tuné : 263 corrections, **108 régressions**, +7,2 points,
McNemar exact p = 4,8e-16. Détail par difficulté et liste des régressions dans
le rapport.

## Ce qui est fait

- Harnais étendu (le synthétique DuckDB reste intact) : exécuteur SQLite en
  lecture seule avec timeout, chargeur Spider, contrôle de fuite, prompt unique
  train/éval, runner reprenable, rapport (Wilson, McNemar, régressions), pont
  vers l'évaluateur officiel avec verdict par item, garde-fou `check-served`.
- Tests : 72 verts (70 + 2 sautés sans les données Spider, cas de la CI).
  Typecheck et lint propres. `scripts/prove-red-all.sh` : 24/24 sabotages font
  passer les tests au rouge.
- Données : Spider 1.0 vérifié (sha256 dans le rapport). 0 base partagée ;
  69 doublons textuels retirés du train (D12).
- Entraînement : config A (défauts mlx-lm, D11), 1 époque, 2 h 02, pic 36,2 Go.
  Modèle final = checkpoint 1000, choisi sur dev par règle écrite avant (D18,
  D20). Écart avec la fin d'époque non significatif (p = 0,31).
- Référence gpt-4o-mini sur test : 0,129 $ (D17).
- Rapport `docs/FINETUNE-REPORT.md`, tableaux générés
  `docs/finetune-test-report.md`, README mis à jour (section Spider, 72 tests,
  licences).

## Incidents trouvés en vérifiant (tous dans le rapport ou DECISIONS)

1. SQLite de Node refuse les chaînes entre guillemets doubles de Spider : 406
   gold en erreur au lieu de 0. Corrigé avant toute mesure (D15).
2. `mlx_lm.server` 0.31.3 ignore `--adapter-path` sans erreur. Le premier
   "fine-tuné" était la base. Détecté par contradiction avec la courbe de perte,
   corrigé (modèle fusionné + garde-fou), le faux run renommé `base-rerun` et
   gardé comme mesure du non-déterminisme (D19).
3. Résultats partiels commités par erreur une fois : retirés (commit amendé,
   jamais poussé).
4. D10 promettait des résultats sans texte Spider : faux, corrigé par une
   notice CC BY-SA (D22).

## Réserves à garder en tête

- Indice (pas preuve) que Qwen a vu Spider : 3,4 % des réponses de base
  reprennent l'espacement typique du gold Spider.
- Non-déterminisme du serveur : 13/834 verdicts changent entre deux passages
  identiques de la base sur dev.
- Une seule config, une seule graine. Pas de recherche d'hyperparamètres.
- Latences de dev polluées (charge concurrente) : seules celles du test sont
  publiées. Mémoire à l'inférence et énergie : non mesurées.

## À décider par Thomas

1. Relire le rapport et les chiffres. Si OK : pousser la branche et ouvrir une
   PR (ou merger). Rien n'est publié tant que Thomas ne l'a pas dit.
2. Historique git : le premier commit de la branche contient une version
   d'ETAT.md qui mentionnait le contexte de candidature. Retiré du fichier
   actuel, mais présent dans l'historique. Branche jamais poussée : on peut
   réécrire l'historique avant publication si Thomas le souhaite.
3. Publier ou non les poids LoRA : NON publiés pour l'instant (données
   d'entraînement CC BY-SA, share-alike ; D10).
4. Supprimer `~/Downloads/open ia api key.rtf` : la clé OpenAI y est en clair
   (elle est aussi dans `.env`, gitignoré, permissions 600).
5. Version française du rapport : à faire sur demande (D21).

## Reprendre ou refaire un run

Commandes exactes dans `docs/FINETUNE-REPORT.md`, section "Reproduce". Tous les
runs sont reprenables (un id déjà présent dans le fichier de résultats est
sauté). Avant tout run d'un modèle local :
`npm run spider -- check-served --expect base|finetuned`.

Fichiers hors git (à ne pas perdre si on veut refaire sans réentraîner) :
`finetune/adapters/` (adaptateurs), `finetune/fused/` (modèles fusionnés,
2,9 Go chacun), `data/` (Spider, évaluateur officiel, venvs).
