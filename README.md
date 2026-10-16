# Veuves et orphelines — script Adobe Illustrator

**DetecterVeuvesOrphelines.jsx** v1.0.0 — repère les dernières lignes trop courtes et les orphelines / veuves de colonne dans les textes captifs Illustrator, avec repères sur un calque non imprimable et correction optionnelle.
*Flags short last lines and column orphans/widows in Illustrator area text, marks them on a non-printing layer, optional fix (FR/EN dialog).*

## Le problème

InDesign a « Conserver les lignes ensemble », le panneau Article et des scripts de contrôle des veuves / orphelines. **Illustrator n'a rien de comparable** : pas de Keep Lines Together, pas de panneau Article (malgré une page marketing Adobe qui le mentionne par erreur pour Illustrator). Les dernières lignes d'un paragraphe trop courtes (« veuves » visuelles / runts) et, en texte multi-colonnes, la première ligne seule en haut d'une colonne (orpheline) ou la dernière seule en bas (veuve de colonne) se corrigent à l'œil ou à la main.

La question Adobe Community *« Is there a script for fixing 'one word on a line at end of paragraph'? »* ne trouve de réponses automatiques que pour InDesign. Pour Illustrator, le conseil reste d'appliquer **Sans retour à la ligne** mot par mot.

## Ce que fait le script

Sur la sélection, le calque actif ou tout le document (textes **captifs** uniquement) :

**Détection**
- **Dernière ligne trop courte** (paragraphes d'au moins 2 lignes) : largeur réelle de la ligne &lt; un % de la mesure (largeur de colonne / cadre), et/ou trop peu de mots, et/ou trop peu de caractères — critères activables séparément ;
- **Orpheline de colonne** : première ligne d'un paragraphe seule dans sa colonne, le reste dans une autre ;
- **Veuve de colonne** : dernière ligne seule dans sa colonne.

Les largeurs sont mesurées via les `geometricBounds` des lignes (repli sur les caractères). Les colonnes sont déduites de `columnCount` / `columnGutter` du cadre.

**Repères** sur un calque non imprimable « · Veuves / orphelines » (aplats + libellés : % de largeur, type). **Effacer les repères** retire le calque. Option de **sélectionner** les blocs concernés.

**Correction optionnelle** (sinon simple contrôle qualité) :
- **Sans retour à la ligne** sur les N derniers mots du paragraphe (même principe que le panneau Caractère — le seul moyen fiable dans Illustrator, l'U+00A0 n'y fonctionne pas) ;
- ou **approche négative** légère sur les lignes précédentes pour tenter de remonter la dernière ligne.

Bouton **Analyser** (repères + rapport, sans correction). Dialogue **FR/EN**. Réglages mémorisés localement. Objets / calques verrouillés ou masqués ignorés. Textes de point et curvilignes exclus (pas de « mesure » de colonne fiable).

Distinct de **TypographieFrancaise.jsx** (applique des No Break prophylactiques sans mesurer les largeurs de ligne composées) et de **DetecterLezardes.jsx** (lézardes / lignes lâches-serrées / trous).

## Pourquoi c'est nouveau

Vérifié le 16 octobre 2026 :

- **Natif Illustrator** : aucune détection ni conservation de veuves / orphelines ; le panneau Article et Keep Lines Together sont des fonctions **InDesign** (la page Adobe « Orphans and widows in typography » mélange les deux produits). Tutoriel LinkedIn = correction manuelle.
- **Scripts InDesign seulement** : fils Adobe Community *widows orphan line script*, Keep Lines Together, styles GREP — rien de portable vers Illustrator.
- **Illustrator** : extraits de forum pour lister les mots en fin de ligne (`paragraphs[i].lines`) ou appliquer No Break à la main ; **aucun script publié** qui mesure le % de largeur de la dernière ligne, détecte les coupures de colonne, pose des repères et propose une correction.
- **GitHub** : recherche `widow orphan illustrator extension:jsx` → aucun outil pertinent ; rien chez creold, Hiroyuki Sato, John Wundes, Alexander Ladygin, wckdtall, Kelso, Josh Duncan, Samolevsky, vexy.
- **Payant** : Typefitter (InDesign) ; pas d'équivalent Illustrator listé chez Astute pour ce contrôle typo.

Idées écartées cette exécution car déjà couvertes ailleurs : marge de sécurité (ReperesImpression.jsx + guides AddMargin / ArtboardRectGuides ; hors plan = ControlePreflight / SelectOutsideArtboard) ; fusion couleurs proches ΔE (Astute QuickOps Reduce Colors + FindReplace « is close to ») ; sticky notes (Samolevsky Sticky Note) ; surimpression (outils Satoru Takahashi, rj-graffix WOPD, Mars Premedia).

## Installation

- **Ponctuelle** : Fichier > Scripts > Autre script…, puis choisir `DetecterVeuvesOrphelines.jsx`.
- **Permanente** : copier le fichier dans `Presets/<langue>/Scripts` d'Illustrator, redémarrer. Le script apparaît dans Fichier > Scripts.

## Utilisation

1. Travaillez sur une **copie** du document.
2. Sélectionnez des textes captifs, ou rien et choisissez Calque actif / Document.
3. Lancez le script, réglez les seuils (33 % de mesure, 2 mots, etc.).
4. **Analyser** pour voir le rapport et les repères ; **Appliquer** si vous activez une correction.
5. Ctrl+Z / Cmd+Z annule les modifications de texte (selon la version d'Illustrator, plusieurs annulations peuvent être nécessaires).

## Version cible et statut des tests

- Cible : Adobe Illustrator CC 2018+ (ExtendScript, Windows et macOS).
- **Non testé dans Illustrator.**
- Syntaxe vérifiée avec acorn (ECMAScript 5 / constructs ES3).
- Cœur vérifié hors Illustrator : `tests/test-core.js` (31 tests) et `tests/test-simulation.js` (9 tests) — ratios, mots, caractères, colonnes, fusion short+widowCol, paragraphes sains.
- Lancer : `node tests/test-core.js` et `node tests/test-simulation.js` (Node.js 14+).

Limites : la mesure dépend des bounds renvoyés par Illustrator (effets, enveloppes, texte débordant peuvent fausser) ; l'approche négative ne garantit pas de remonter la ligne (compositeur de paragraphe) ; les textes arabes/hébreu multi-colonnes n'ont pas de logique RTL dédiée ; les cadres liés ne sont analysés qu'une fois (premier cadre de l'article).

Aucun appel réseau, aucune collecte de données.

## Licence

MIT © 2026 Amirouche Amwanes — voir [LICENSE](LICENSE).
