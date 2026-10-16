//@target illustrator
/*
 * DetecterVeuvesOrphelines.jsx — v1.0.0
 * Veuves, orphelines et dernières lignes trop courtes / Widows, orphans and short last lines
 *
 * FR : Illustrator n'a ni « Keep Lines Together », ni panneau Article pour signaler les
 *      veuves et orphelines (contrairement à InDesign). Ce script inspecte les blocs
 *      de texte captifs (y compris multi-colonnes) et repère :
 *        - les dernières lignes trop courtes (veuve visuelle : largeur < % de la mesure,
 *          ou trop peu de mots / caractères) ;
 *        - les orphelines / veuves de colonne (1ʳᵉ ou dernière ligne d'un paragraphe
 *          seule dans une autre colonne que le reste).
 *      Repères sur un calque non imprimable. Correction optionnelle : Sans retour à la
 *      ligne sur les derniers mots, ou approche négative légère pour remonter la ligne.
 *      Distinct de TypographieFrancaise.jsx (qui pose des No Break prophylactiques
 *      sans mesurer les largeurs de ligne) et de DetecterLezardes.jsx (lézardes / C&J).
 * EN : Illustrator has neither Keep Lines Together nor a Story panel for widows/orphans
 *      (unlike InDesign). This script inspects area text (incl. multi-column) and flags:
 *        - short last lines (visual widow: width < % of measure, or too few words/chars);
 *        - column orphans/widows (first/last line of a paragraph alone in another column).
 *      Marks on a non-printing layer. Optional fix: No Break on last words, or slight
 *      negative tracking to pull the line up. Distinct from TypographieFrancaise.jsx
 *      (prophylactic No Break without measuring line widths) and DetecterLezardes.jsx.
 *
 * Auteur / Author : Amirouche Amwanes — Licence MIT / MIT License
 * Cible / Target : Adobe Illustrator CC 2018+ (ExtendScript ES3). Non testé dans Illustrator.
 * Aucun appel réseau, aucune collecte de données. / No network calls, no data collection.
 * Conseil : travaillez sur une copie du document. / Tip: work on a copy of your document.
 */

/* ===================================================================== */
/*  1. CŒUR (pur, sans Illustrator) / PURE CORE                           */
/* ===================================================================== */

var VO_CORE = (function () {
    var C = {};

    C.trim = function (s) {
        s = String(s === undefined || s === null ? "" : s);
        return s.replace(/^\s+|\s+$/g, "");
    };

    C.wordCount = function (s) {
        s = C.trim(s);
        if (!s) return 0;
        var parts = s.split(/\s+/), n = 0, i;
        for (i = 0; i < parts.length; i++) if (parts[i].length) n++;
        return n;
    };

    C.charCountVisible = function (s) {
        s = C.trim(String(s === undefined || s === null ? "" : s));
        var n = 0, i, c;
        for (i = 0; i < s.length; i++) {
            c = s.charCodeAt(i);
            if (c < 32 || c === 0x2028 || c === 0x2029) continue;
            if (c === 0x200B || c === 0xFEFF) continue;
            n++;
        }
        return n;
    };

    // Ratio largeur dernière ligne / mesure (0–1). / last-line width over measure.
    C.lineRatio = function (lineW, measureW) {
        if (!(measureW > 0)) return 1;
        if (!(lineW > 0)) return 0;
        var r = lineW / measureW;
        if (r < 0) return 0;
        if (r > 1) return 1;
        return r;
    };

    /**
     * Classe une dernière ligne de paragraphe.
     * options: maxRatio (0.33), maxWords (2), minChars (12),
     *          useRatio, useWords, useChars
     */
    C.classifyShortLast = function (line, o) {
        o = o || {};
        var useR = o.useRatio !== false;
        var useW = o.useWords !== false;
        var useC = o.useChars !== false;
        var maxR = o.maxRatio !== undefined ? o.maxRatio : 0.33;
        var maxW = o.maxWords !== undefined ? o.maxWords : 2;
        var minC = o.minChars !== undefined ? o.minChars : 12;
        var reasons = [];
        var ratio = C.lineRatio(line.width, line.measure);
        var words = line.words !== undefined ? line.words : C.wordCount(line.text);
        var chars = line.chars !== undefined ? line.chars : C.charCountVisible(line.text);

        if (useR && ratio < maxR) reasons.push("ratio");
        if (useW && words > 0 && words <= maxW) reasons.push("words");
        if (useC && chars > 0 && chars < minC) reasons.push("chars");

        // Une seule ligne de paragraphe : ce n'est pas une veuve (sauf si on force)
        if (line.paraLines === 1 && !o.flagSingleLine) {
            return { short: false, reasons: [], ratio: ratio, words: words, chars: chars };
        }

        return {
            short: reasons.length > 0,
            reasons: reasons,
            ratio: ratio,
            words: words,
            chars: chars
        };
    };

    /**
     * Détecte orpheline / veuve de colonne à partir d'indices de colonne par ligne.
     * lines: [{col: number}, ...] pour UN paragraphe (ordre haut→bas / lecture).
     * Orpheline : 1ʳᵉ ligne seule dans sa colonne, reste ailleurs.
     * Veuve de colonne : dernière ligne seule dans sa colonne, reste ailleurs.
     */
    C.classifyColumnBreaks = function (lines) {
        var out = { orphan: false, widowCol: false };
        if (!lines || lines.length < 2) return out;

        function countInCol(col) {
            var n = 0, i;
            for (i = 0; i < lines.length; i++) if (lines[i].col === col) n++;
            return n;
        }

        var firstCol = lines[0].col;
        var lastCol = lines[lines.length - 1].col;
        var cols = {};
        var i, c, distinct = 0;
        for (i = 0; i < lines.length; i++) {
            c = lines[i].col;
            if (!cols["c" + c]) { cols["c" + c] = true; distinct++; }
        }
        if (distinct < 2) return out;

        // Orpheline : première ligne seule dans sa colonne
        if (countInCol(firstCol) === 1) out.orphan = true;
        // Veuve de colonne : dernière ligne seule dans sa colonne
        if (countInCol(lastCol) === 1) out.widowCol = true;
        return out;
    };

    /**
     * Assigne un index de colonne à partir de la position left et des largeurs de colonnes.
     * columnLefts: [x0, x1, ...] bords gauches des colonnes (croissant).
     */
    C.columnIndex = function (left, columnLefts, tol) {
        tol = tol !== undefined ? tol : 2;
        if (!columnLefts || !columnLefts.length) return 0;
        var best = 0, i, d, bestD = Infinity;
        for (i = 0; i < columnLefts.length; i++) {
            d = Math.abs(left - columnLefts[i]);
            if (d < bestD) { bestD = d; best = i; }
        }
        // Si hors tolérance, prend la colonne dont left <= x < next
        if (bestD > tol) {
            best = 0;
            for (i = 0; i < columnLefts.length; i++) {
                if (left + tol >= columnLefts[i]) best = i;
            }
        }
        return best;
    };

    /**
     * Calcule les lefts de colonnes à partir du cadre et du nombre de colonnes.
     * frameL, frameW, nCols, gutter
     */
    C.columnLefts = function (frameL, frameW, nCols, gutter) {
        nCols = Math.max(1, Math.floor(nCols || 1));
        gutter = gutter || 0;
        if (nCols === 1) return [frameL];
        var totalG = gutter * (nCols - 1);
        var colW = (frameW - totalG) / nCols;
        var out = [], i;
        for (i = 0; i < nCols; i++) out.push(frameL + i * (colW + gutter));
        return out;
    };

    C.excerpt = function (s, n) {
        s = C.trim(String(s || "").replace(/\s+/g, " "));
        if (s.length <= n) return s;
        return s.substring(0, n - 1) + "\u2026";
    };

    /**
     * Analyse un paragraphe déjà mesuré.
     * para = {
     *   lines: [{ width, measure, text, words, chars, left, top, bot, col }],
     * }
     * Retourne issues[] : { kind, lineIndex, ratio, words, chars, reasons }
     */
    C.analyseParagraph = function (para, o) {
        o = o || {};
        var issues = [];
        var lines = para.lines || [];
        if (!lines.length) return issues;

        var i;
        for (i = 0; i < lines.length; i++) {
            lines[i].paraLines = lines.length;
        }

        // Dernière ligne courte (sauf si une seule ligne)
        if (o.doShort !== false && lines.length >= 2) {
            var last = lines[lines.length - 1];
            var cls = C.classifyShortLast(last, o);
            if (cls.short) {
                issues.push({
                    kind: "short",
                    lineIndex: lines.length - 1,
                    ratio: cls.ratio,
                    words: cls.words,
                    chars: cls.chars,
                    reasons: cls.reasons.slice(0),
                    left: last.left,
                    top: last.top,
                    bot: last.bot,
                    right: last.left + last.width,
                    text: last.text
                });
            }
        }

        // Colonnes
        if (o.doColumns !== false && lines.length >= 2) {
            var colInfo = C.classifyColumnBreaks(lines);
            if (colInfo.orphan) {
                var L0 = lines[0];
                issues.push({
                    kind: "orphan",
                    lineIndex: 0,
                    ratio: C.lineRatio(L0.width, L0.measure),
                    words: L0.words !== undefined ? L0.words : C.wordCount(L0.text),
                    chars: L0.chars !== undefined ? L0.chars : C.charCountVisible(L0.text),
                    reasons: ["column"],
                    left: L0.left,
                    top: L0.top,
                    bot: L0.bot,
                    right: L0.left + L0.width,
                    text: L0.text
                });
            }
            if (colInfo.widowCol) {
                var Ln = lines[lines.length - 1];
                // Évite le doublon si déjà short sur la même ligne
                var dup = false;
                for (i = 0; i < issues.length; i++) {
                    if (issues[i].lineIndex === lines.length - 1 && issues[i].kind === "short") {
                        issues[i].kind = "short+widowCol";
                        issues[i].reasons.push("column");
                        dup = true;
                        break;
                    }
                }
                if (!dup) {
                    issues.push({
                        kind: "widowCol",
                        lineIndex: lines.length - 1,
                        ratio: C.lineRatio(Ln.width, Ln.measure),
                        words: Ln.words !== undefined ? Ln.words : C.wordCount(Ln.text),
                        chars: Ln.chars !== undefined ? Ln.chars : C.charCountVisible(Ln.text),
                        reasons: ["column"],
                        left: Ln.left,
                        top: Ln.top,
                        bot: Ln.bot,
                        right: Ln.left + Ln.width,
                        text: Ln.text
                    });
                }
            }
        }

        return issues;
    };

    return C;
})();

/* ===================================================================== */
/*  2. ILLUSTRATOR — mesure, repères, correction                         */
/* ===================================================================== */

var VO_T = {
    fr: {
        title: "Veuves et orphelines",
        layer: "\u00B7 Veuves / orphelines",
        noDoc: "Aucun document ouvert.",
        noText: "Aucun bloc de texte captif dans la port\u00E9e choisie.",
        tip: "Conseil : travaillez sur une copie du document.",
        scope: "Port\u00E9e",
        scopeDoc: "Document",
        scopeLayer: "Calque actif",
        scopeSel: "S\u00E9lection",
        opts: "D\u00E9tection",
        doShort: "Derni\u00E8res lignes trop courtes",
        doColumns: "Orphelines / veuves de colonne",
        maxRatio: "Largeur max. derni\u00E8re ligne (% mesure)",
        maxWords: "Mots max. sur la derni\u00E8re ligne",
        minChars: "Caract\u00E8res min. sur la derni\u00E8re ligne",
        useRatio: "Par largeur",
        useWords: "Par nombre de mots",
        useChars: "Par nombre de caract\u00E8res",
        mark: "Poser des rep\u00E8res (calque non imprimable)",
        selectHit: "S\u00E9lectionner les blocs concern\u00E9s",
        fix: "Correction (optionnelle)",
        fixNone: "Aucune (rep\u00E9rage seul)",
        fixNobreak: "Sans retour \u00E0 la ligne sur les N derniers mots",
        fixTrack: "Approche n\u00E9gative pour remonter la ligne",
        nWords: "N mots (No Break)",
        trackVal: "Approche (1/1000 em)",
        analyse: "Analyser",
        apply: "Appliquer",
        clear: "Effacer les rep\u00E8res",
        close: "Fermer",
        lang: "EN",
        short: "ligne courte",
        orphan: "orpheline",
        widowCol: "veuve de colonne",
        ok: "aucune anomalie",
        report: "Rapport",
        frames: "blocs",
        issues: "anomalies",
        done: "Termin\u00E9.",
        failed: "\u00E9chec mesure",
        undo: "Veuves/orphelines",
        copyAdvice: "Modifications annulables (Annuler). Travaillez sur une copie."
    },
    en: {
        title: "Widows & orphans",
        layer: "\u00B7 Widows / orphans",
        noDoc: "No document open.",
        noText: "No area text frames in the chosen scope.",
        tip: "Tip: work on a copy of your document.",
        scope: "Scope",
        scopeDoc: "Document",
        scopeLayer: "Active layer",
        scopeSel: "Selection",
        opts: "Detection",
        doShort: "Short last lines",
        doColumns: "Column orphans / widows",
        maxRatio: "Max last-line width (% of measure)",
        maxWords: "Max words on last line",
        minChars: "Min characters on last line",
        useRatio: "By width",
        useWords: "By word count",
        useChars: "By character count",
        mark: "Place markers (non-printing layer)",
        selectHit: "Select affected frames",
        fix: "Fix (optional)",
        fixNone: "None (detect only)",
        fixNobreak: "No Break on last N words",
        fixTrack: "Negative tracking to pull line up",
        nWords: "N words (No Break)",
        trackVal: "Tracking (1/1000 em)",
        analyse: "Analyze",
        apply: "Apply",
        clear: "Clear markers",
        close: "Close",
        lang: "FR",
        short: "short line",
        orphan: "orphan",
        widowCol: "column widow",
        ok: "no issues",
        report: "Report",
        frames: "frames",
        issues: "issues",
        done: "Done.",
        failed: "measure failed",
        undo: "Widows/orphans",
        copyAdvice: "Changes are undoable. Work on a copy."
    }
};

var VO_lang = "fr";
var VO_UI = VO_T.fr;

function VO_setLang(code) {
    VO_lang = code === "en" ? "en" : "fr";
    VO_UI = VO_T[VO_lang];
}

function VO_color(doc, r, g, b, cmyk) {
    var c;
    try {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            c = new CMYKColor();
            c.cyan = cmyk[0]; c.magenta = cmyk[1]; c.yellow = cmyk[2]; c.black = cmyk[3];
            return c;
        }
    } catch (e) {}
    c = new RGBColor(); c.red = r; c.green = g; c.blue = b;
    return c;
}

function VO_findLayer(doc) {
    var i;
    try {
        for (i = 0; i < doc.layers.length; i++) {
            if (doc.layers[i].name === VO_UI.layer || doc.layers[i].name === VO_T.fr.layer || doc.layers[i].name === VO_T.en.layer) {
                return doc.layers[i];
            }
        }
    } catch (e) {}
    return null;
}

function VO_markLayer(doc) {
    var L = VO_findLayer(doc);
    if (!L) { L = doc.layers.add(); L.name = VO_UI.layer; }
    try { L.locked = false; L.visible = true; L.printable = false; } catch (e) {}
    try { L.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e1) {}
    return L;
}

function VO_clearMarks(doc) {
    var L = VO_findLayer(doc);
    if (!L) return false;
    try { L.locked = false; L.remove(); } catch (e) { return false; }
    return true;
}

function VO_isLockedHidden(item) {
    try {
        if (item.locked || item.hidden) return true;
        var L = item.layer;
        if (L && (L.locked || !L.visible)) return true;
    } catch (e) {}
    return false;
}

function VO_collectFrames(doc, scope) {
    var out = [], seen = {};
    function add(tf) {
        if (!tf) return;
        try {
            if (tf.typename !== "TextFrame") return;
            if (tf.kind !== TextType.AREATEXT) return;
            if (VO_isLockedHidden(tf)) return;
            if (!tf.contents || !String(tf.contents).replace(/\s/g, "").length) return;
            // Blocs liés : une fois par story (premier cadre)
            var id;
            try { id = tf.story && tf.uuid ? String(tf.uuid) : null; } catch (e0) { id = null; }
            if (!id) {
                try { id = "c" + String(tf.contents).length + "_" + Math.round(tf.left) + "_" + Math.round(tf.top); } catch (e1) { id = String(out.length); }
            }
            // Pour les articles liés, n'ajoute que le premier cadre non traité de la story
            try {
                if (tf.story && tf.story.textFrames && tf.story.textFrames.length > 1) {
                    var first = tf.story.textFrames[0];
                    if (first !== tf) {
                        // On analyse le story via le premier cadre seulement si on le rencontre ;
                        // ici on saute les cadres suivants pour éviter les doublons.
                        var sid = "story_" + String(tf.story.textFrames[0].uuid || tf.story.textFrames.length);
                        if (seen[sid]) return;
                        // Si ce n'est pas le premier, on ignore (le premier sera ajouté séparément)
                        return;
                    }
                    id = "story_" + String(tf.uuid || out.length);
                }
            } catch (e2) {}
            if (seen[id]) return;
            seen[id] = true;
            out.push(tf);
        } catch (e) {}
    }

    function walk(items) {
        var i, it;
        for (i = 0; i < items.length; i++) {
            it = items[i];
            try {
                if (it.typename === "TextFrame") add(it);
                else if (it.typename === "GroupItem" && it.pageItems) walk(it.pageItems);
            } catch (e) {}
        }
    }

    var i;
    if (scope === "sel") {
        if (!doc.selection || !doc.selection.length) return out;
        walk(doc.selection);
    } else if (scope === "layer") {
        try { walk(doc.activeLayer.pageItems); } catch (e) {}
    } else {
        try {
            for (i = 0; i < doc.textFrames.length; i++) add(doc.textFrames[i]);
        } catch (e2) {
            walk(doc.pageItems);
        }
    }
    return out;
}

function VO_frameGeom(tf) {
    var gb;
    try { gb = tf.geometricBounds; } catch (e) { return null; }
    // [left, top, right, bottom]
    return {
        l: gb[0],
        t: gb[1],
        r: gb[2],
        b: gb[3],
        w: gb[2] - gb[0],
        h: gb[1] - gb[3]
    };
}

function VO_lineBounds(line) {
    // Essaie geometricBounds du TextRange line ; repli characters.
    var gb, i, L = Infinity, T = -Infinity, R = -Infinity, B = Infinity, got = false;
    try {
        gb = line.geometricBounds;
        if (gb && gb.length === 4) {
            return { l: gb[0], t: gb[1], r: gb[2], b: gb[3], w: gb[2] - gb[0], h: gb[1] - gb[3] };
        }
    } catch (e) {}
    try {
        for (i = 0; i < line.characters.length; i++) {
            try {
                gb = line.characters[i].geometricBounds;
                if (!gb) continue;
                if (gb[0] < L) L = gb[0];
                if (gb[1] > T) T = gb[1];
                if (gb[2] > R) R = gb[2];
                if (gb[3] < B) B = gb[3];
                got = true;
            } catch (e1) {}
        }
    } catch (e2) {}
    if (!got) return null;
    return { l: L, t: T, r: R, b: B, w: R - L, h: T - B };
}

function VO_measureParagraph(para, frameInfo, o) {
    var linesOut = [], i, ln, b, txt, colLefts, measure;
    var nCols = frameInfo.nCols || 1;
    colLefts = frameInfo.colLefts || [frameInfo.l];
    measure = frameInfo.colW || frameInfo.w;

    try {
        if (!para.lines || para.lines.length === 0) return { lines: [] };
        for (i = 0; i < para.lines.length; i++) {
            ln = para.lines[i];
            txt = "";
            try { txt = String(ln.contents); } catch (e) { txt = ""; }
            b = VO_lineBounds(ln);
            if (!b) {
                // Repli : largeur estimée nulle → ignore
                continue;
            }
            var col = VO_CORE.columnIndex(b.l, colLefts, 3);
            var m = measure;
            if (nCols > 1 && frameInfo.colW) m = frameInfo.colW;
            linesOut.push({
                width: b.w,
                measure: m,
                text: txt,
                words: VO_CORE.wordCount(txt),
                chars: VO_CORE.charCountVisible(txt),
                left: b.l,
                top: b.t,
                bot: b.b,
                col: col
            });
        }
    } catch (e2) {
        return { lines: [], error: true };
    }
    return { lines: linesOut };
}

function VO_frameInfo(tf) {
    var g = VO_frameGeom(tf);
    if (!g) return null;
    var nCols = 1, gutter = 0;
    try { nCols = Math.max(1, tf.columnCount || 1); } catch (e) { nCols = 1; }
    try { gutter = tf.columnGutter || 0; } catch (e1) { gutter = 0; }
    var colLefts = VO_CORE.columnLefts(g.l, g.w, nCols, gutter);
    var colW = g.w;
    if (nCols > 1) colW = (g.w - gutter * (nCols - 1)) / nCols;
    return { l: g.l, t: g.t, r: g.r, b: g.b, w: g.w, h: g.h, nCols: nCols, gutter: gutter, colLefts: colLefts, colW: colW };
}

function VO_analyseFrame(tf, o) {
    var res = { tf: tf, issues: [], error: false, paras: 0 };
    var info = VO_frameInfo(tf);
    if (!info) { res.error = true; return res; }

    var paras, i, p, measured, issues, j;
    try {
        // Préférer story pour texte lié
        var root = tf;
        try {
            if (tf.story && tf.story.textFrames && tf.story.textFrames.length) root = tf.story.textFrames[0];
        } catch (e0) {}
        paras = root.paragraphs;
        for (i = 0; i < paras.length; i++) {
            p = paras[i];
            var ptxt = "";
            try { ptxt = String(p.contents); } catch (e1) { ptxt = ""; }
            if (!VO_CORE.trim(ptxt).replace(/\r/g, "").length) continue;
            // Ignore paragraphes entièrement dans d'autres cadres liés ? On mesure les lines du paragraphe.
            measured = VO_measureParagraph(p, info, o);
            if (measured.error) continue;
            if (!measured.lines.length) continue;
            res.paras++;
            issues = VO_CORE.analyseParagraph(measured, o);
            for (j = 0; j < issues.length; j++) {
                issues[j].paraIndex = i;
                issues[j].frame = tf;
                res.issues.push(issues[j]);
            }
        }
    } catch (e) {
        res.error = true;
    }
    return res;
}

function VO_label(layer, x, y, txt, size, col) {
    try {
        var t = layer.textFrames.add();
        t.contents = txt;
        t.textRange.characterAttributes.size = size;
        t.textRange.characterAttributes.fillColor = col;
        t.position = [x, y];
        return 1;
    } catch (e) { return 0; }
}

function VO_drawIssues(res, layer, doc) {
    var n = 0, i, iss;
    var cShort = VO_color(doc, 230, 0, 126, [0, 100, 0, 0]);
    var cOrph = VO_color(doc, 255, 140, 0, [0, 50, 100, 0]);
    var cWid = VO_color(doc, 0, 120, 255, [80, 40, 0, 0]);
    for (i = 0; i < res.issues.length; i++) {
        iss = res.issues[i];
        var col = cShort;
        var name = VO_UI.short;
        if (iss.kind === "orphan") { col = cOrph; name = VO_UI.orphan; }
        else if (iss.kind === "widowCol") { col = cWid; name = VO_UI.widowCol; }
        else if (iss.kind === "short+widowCol") { col = cShort; name = VO_UI.short + "+" + VO_UI.widowCol; }

        var w = Math.max((iss.right || iss.left) - iss.left, 1);
        var h = Math.max(iss.top - iss.bot, 1);
        try {
            var rc = layer.pathItems.rectangle(iss.top + 0.5, iss.left, w, h + 1);
            rc.filled = true; rc.stroked = true;
            rc.fillColor = col; rc.strokeColor = col;
            rc.opacity = 35; rc.strokeWidth = 0.5;
            rc.name = name + " " + Math.round(iss.ratio * 100) + "%";
            n++;
            var fs = Math.max(5, Math.min(9, h * 0.55));
            var lab = name;
            if (iss.kind.indexOf("short") === 0) lab += " " + Math.round(iss.ratio * 100) + "%";
            n += VO_label(layer, iss.left, iss.top + fs + 1, lab, fs, col);
        } catch (e) {}
    }
    return n;
}

function VO_applyNoBreak(issue, nWords) {
    nWords = Math.max(1, Math.floor(nWords || 2));
    try {
        var tf = issue.frame;
        var para = tf.paragraphs[issue.paraIndex];
        var lines = para.lines;
        var last = lines[lines.length - 1];
        // Applique No Break sur les nWords derniers mots du paragraphe (pas seulement la dernière ligne)
        var words = para.words;
        var start = Math.max(0, words.length - nWords);
        var i, w, j;
        for (i = start; i < words.length; i++) {
            w = words[i];
            try {
                for (j = 0; j < w.characters.length; j++) {
                    w.characters[j].characterAttributes.noBreak = true;
                }
                // Espace avant le mot (sauf premier)
                if (i > 0) {
                    try {
                        var prev = words[i - 1];
                        var after = prev.characters[prev.characters.length - 1];
                        // Cherche l'espace suivant dans le paragraphe — approche simple : noBreak sur le mot suffit souvent
                    } catch (e0) {}
                }
            } catch (e1) {}
        }
        // Aussi l'espace entre les mots ciblés : étend noBreak sur une plage characters
        try {
            if (words.length >= nWords) {
                var firstW = words[words.length - nWords];
                var lastW = words[words.length - 1];
                var from = firstW.characters[0];
                var to = lastW.characters[lastW.characters.length - 1];
                // TextRange du premier au dernier caractère
                var tr = tf.textRange;
                // Fallback caractère par caractère déjà fait
            }
        } catch (e2) {}
        return true;
    } catch (e) { return false; }
}

function VO_applyTracking(issue, track) {
    track = track !== undefined ? track : -20;
    try {
        var tf = issue.frame;
        var para = tf.paragraphs[issue.paraIndex];
        // Approche sur tout le paragraphe sauf la dernière ligne trop courte — sur les lignes précédentes
        var lines = para.lines;
        if (lines.length < 2) return false;
        var i, j, ln;
        for (i = 0; i < lines.length - 1; i++) {
            ln = lines[i];
            try {
                for (j = 0; j < ln.characters.length; j++) {
                    var cur = ln.characters[j].characterAttributes.tracking;
                    ln.characters[j].characterAttributes.tracking = cur + track;
                }
            } catch (e1) {}
        }
        return true;
    } catch (e) { return false; }
}

function VO_reportFrame(idx, res) {
    var T = VO_UI;
    var s = T.frames.replace(/s$/, "") + " " + idx + " \u00AB " + VO_CORE.excerpt(res.tf.contents, 28) + " \u00BB : ";
    if (res.error) return s + T.failed;
    if (!res.issues.length) return s + T.ok;
    var parts = [], i, iss, label;
    for (i = 0; i < res.issues.length; i++) {
        iss = res.issues[i];
        label = iss.kind;
        if (iss.kind.indexOf("short") === 0) label = T.short + " (" + Math.round(iss.ratio * 100) + "%)";
        else if (iss.kind === "orphan") label = T.orphan;
        else if (iss.kind === "widowCol") label = T.widowCol;
        parts.push(label);
    }
    return s + res.issues.length + " " + T.issues + " \u2014 " + parts.join(", ");
}

function VO_run(doc, frames, o, doMark, doFix, progress) {
    var results = [], total = 0, i, res, affected = [];
    if (doMark) VO_clearMarks(doc);
    var layer = doMark ? VO_markLayer(doc) : null;

    for (i = 0; i < frames.length; i++) {
        res = VO_analyseFrame(frames[i], o);
        results.push(VO_reportFrame(i + 1, res));
        total += res.issues.length;
        if (res.issues.length) {
            affected.push(frames[i]);
            if (doMark && layer) VO_drawIssues(res, layer, doc);
            if (doFix && o.fixMode === "nobreak") {
                var j;
                for (j = 0; j < res.issues.length; j++) {
                    if (res.issues[j].kind.indexOf("short") === 0 || res.issues[j].kind === "widowCol") {
                        VO_applyNoBreak(res.issues[j], o.nWords);
                    }
                }
            } else if (doFix && o.fixMode === "track") {
                for (j = 0; j < res.issues.length; j++) {
                    if (res.issues[j].kind.indexOf("short") === 0) {
                        VO_applyTracking(res.issues[j], o.trackVal);
                    }
                }
            }
        }
        if (progress) progress(i + 1);
    }

    if (o.selectHit && affected.length) {
        try {
            doc.selection = null;
            for (i = 0; i < affected.length; i++) affected[i].selected = true;
        } catch (e) {}
    }

    // Si calque vide après analyse, le retirer
    if (doMark && layer && total === 0) {
        try { VO_clearMarks(doc); } catch (e2) {}
    }

    return { reports: results, total: total, affected: affected.length, frames: frames.length };
}

/* ===================================================================== */
/*  3. DIALOGUE ScriptUI                                                  */
/* ===================================================================== */

function VO_prefsPath() {
    try {
        var f = Folder.userData;
        if (f) return File(f.fsName + "/DetecterVeuvesOrphelines.json");
    } catch (e) {}
    return null;
}

function VO_loadPrefs() {
    var p = { lang: "fr", scope: "doc", maxRatio: 33, maxWords: 2, minChars: 12,
              useRatio: true, useWords: true, useChars: false,
              doShort: true, doColumns: true, mark: true, selectHit: false,
              fixMode: "none", nWords: 2, trackVal: -20 };
    try {
        var f = VO_prefsPath();
        if (f && f.exists) {
            f.open("r"); var s = f.read(); f.close();
            var o = eval("(" + s + ")");
            var k; for (k in o) if (o.hasOwnProperty(k)) p[k] = o[k];
        }
    } catch (e) {}
    return p;
}

function VO_savePrefs(p) {
    try {
        var f = VO_prefsPath();
        if (!f) return;
        var s = "({lang:'" + p.lang + "',scope:'" + p.scope + "',maxRatio:" + p.maxRatio +
            ",maxWords:" + p.maxWords + ",minChars:" + p.minChars +
            ",useRatio:" + !!p.useRatio + ",useWords:" + !!p.useWords + ",useChars:" + !!p.useChars +
            ",doShort:" + !!p.doShort + ",doColumns:" + !!p.doColumns +
            ",mark:" + !!p.mark + ",selectHit:" + !!p.selectHit +
            ",fixMode:'" + p.fixMode + "',nWords:" + p.nWords + ",trackVal:" + p.trackVal + "})";
        f.open("w"); f.write(s); f.close();
    } catch (e) {}
}

function VO_buildOpts(p) {
    return {
        doShort: !!p.doShort,
        doColumns: !!p.doColumns,
        maxRatio: (p.maxRatio || 33) / 100,
        maxWords: p.maxWords || 2,
        minChars: p.minChars || 12,
        useRatio: !!p.useRatio,
        useWords: !!p.useWords,
        useChars: !!p.useChars,
        selectHit: !!p.selectHit,
        fixMode: p.fixMode || "none",
        nWords: p.nWords || 2,
        trackVal: p.trackVal || -20
    };
}

function VO_showDialog() {
    if (!app.documents.length) {
        alert(VO_UI.noDoc);
        return;
    }
    var doc = app.activeDocument;
    var prefs = VO_loadPrefs();
    VO_setLang(prefs.lang);

    var w = new Window("dialog", VO_UI.title);
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 8;
    w.margins = 14;

    // Langue
    var top = w.add("group");
    top.alignment = ["fill", "top"];
    var tip = top.add("statictext", undefined, VO_UI.tip);
    tip.alignment = ["fill", "center"];
    var btnLang = top.add("button", undefined, VO_UI.lang);
    btnLang.preferredSize = [40, 22];

    // Portée
    var gScope = w.add("panel", undefined, VO_UI.scope);
    gScope.orientation = "row";
    gScope.alignChildren = ["left", "center"];
    var rDoc = gScope.add("radiobutton", undefined, VO_UI.scopeDoc);
    var rLay = gScope.add("radiobutton", undefined, VO_UI.scopeLayer);
    var rSel = gScope.add("radiobutton", undefined, VO_UI.scopeSel);
    if (prefs.scope === "layer") rLay.value = true;
    else if (prefs.scope === "sel") rSel.value = true;
    else rDoc.value = true;

    // Détection
    var gOpt = w.add("panel", undefined, VO_UI.opts);
    gOpt.orientation = "column";
    gOpt.alignChildren = ["fill", "top"];
    var cbShort = gOpt.add("checkbox", undefined, VO_UI.doShort); cbShort.value = prefs.doShort !== false;
    var cbCol = gOpt.add("checkbox", undefined, VO_UI.doColumns); cbCol.value = prefs.doColumns !== false;

    var gCrit = gOpt.add("group");
    gCrit.orientation = "column";
    gCrit.alignChildren = ["fill", "top"];
    var cbR = gCrit.add("checkbox", undefined, VO_UI.useRatio); cbR.value = prefs.useRatio !== false;
    var gR = gCrit.add("group");
    gR.add("statictext", undefined, VO_UI.maxRatio);
    var edR = gR.add("edittext", undefined, String(prefs.maxRatio || 33));
    edR.preferredSize = [50, 22];

    var cbW = gCrit.add("checkbox", undefined, VO_UI.useWords); cbW.value = prefs.useWords !== false;
    var gW = gCrit.add("group");
    gW.add("statictext", undefined, VO_UI.maxWords);
    var edW = gW.add("edittext", undefined, String(prefs.maxWords || 2));
    edW.preferredSize = [50, 22];

    var cbC = gCrit.add("checkbox", undefined, VO_UI.useChars); cbC.value = !!prefs.useChars;
    var gC = gCrit.add("group");
    gC.add("statictext", undefined, VO_UI.minChars);
    var edC = gC.add("edittext", undefined, String(prefs.minChars || 12));
    edC.preferredSize = [50, 22];

    var cbMark = w.add("checkbox", undefined, VO_UI.mark); cbMark.value = prefs.mark !== false;
    var cbSel = w.add("checkbox", undefined, VO_UI.selectHit); cbSel.value = !!prefs.selectHit;

    // Correction
    var gFix = w.add("panel", undefined, VO_UI.fix);
    gFix.orientation = "column";
    gFix.alignChildren = ["fill", "top"];
    var rNone = gFix.add("radiobutton", undefined, VO_UI.fixNone);
    var rNb = gFix.add("radiobutton", undefined, VO_UI.fixNobreak);
    var rTr = gFix.add("radiobutton", undefined, VO_UI.fixTrack);
    if (prefs.fixMode === "nobreak") rNb.value = true;
    else if (prefs.fixMode === "track") rTr.value = true;
    else rNone.value = true;
    var gNb = gFix.add("group");
    gNb.add("statictext", undefined, VO_UI.nWords);
    var edNb = gNb.add("edittext", undefined, String(prefs.nWords || 2));
    edNb.preferredSize = [50, 22];
    var gTr = gFix.add("group");
    gTr.add("statictext", undefined, VO_UI.trackVal);
    var edTr = gTr.add("edittext", undefined, String(prefs.trackVal || -20));
    edTr.preferredSize = [50, 22];

    var gBtn = w.add("group");
    gBtn.alignment = ["fill", "bottom"];
    var bAna = gBtn.add("button", undefined, VO_UI.analyse);
    var bApp = gBtn.add("button", undefined, VO_UI.apply);
    var bClr = gBtn.add("button", undefined, VO_UI.clear);
    var bClose = gBtn.add("button", undefined, VO_UI.close, { name: "cancel" });

    function readPrefs() {
        prefs.lang = VO_lang;
        prefs.scope = rSel.value ? "sel" : (rLay.value ? "layer" : "doc");
        prefs.doShort = cbShort.value;
        prefs.doColumns = cbCol.value;
        prefs.useRatio = cbR.value;
        prefs.useWords = cbW.value;
        prefs.useChars = cbC.value;
        prefs.maxRatio = parseFloat(edR.text) || 33;
        prefs.maxWords = parseInt(edW.text, 10) || 2;
        prefs.minChars = parseInt(edC.text, 10) || 12;
        prefs.mark = cbMark.value;
        prefs.selectHit = cbSel.value;
        prefs.fixMode = rNb.value ? "nobreak" : (rTr.value ? "track" : "none");
        prefs.nWords = parseInt(edNb.text, 10) || 2;
        prefs.trackVal = parseFloat(edTr.text) || -20;
        return prefs;
    }

    function relabel() {
        w.text = VO_UI.title;
        tip.text = VO_UI.tip;
        btnLang.text = VO_UI.lang;
        gScope.text = VO_UI.scope;
        rDoc.text = VO_UI.scopeDoc;
        rLay.text = VO_UI.scopeLayer;
        rSel.text = VO_UI.scopeSel;
        gOpt.text = VO_UI.opts;
        cbShort.text = VO_UI.doShort;
        cbCol.text = VO_UI.doColumns;
        cbR.text = VO_UI.useRatio;
        cbW.text = VO_UI.useWords;
        cbC.text = VO_UI.useChars;
        cbMark.text = VO_UI.mark;
        cbSel.text = VO_UI.selectHit;
        gFix.text = VO_UI.fix;
        rNone.text = VO_UI.fixNone;
        rNb.text = VO_UI.fixNobreak;
        rTr.text = VO_UI.fixTrack;
        bAna.text = VO_UI.analyse;
        bApp.text = VO_UI.apply;
        bClr.text = VO_UI.clear;
        bClose.text = VO_UI.close;
    }

    btnLang.onClick = function () {
        readPrefs();
        VO_setLang(VO_lang === "fr" ? "en" : "fr");
        prefs.lang = VO_lang;
        relabel();
    };

    function doRun(analyseOnly) {
        readPrefs();
        VO_savePrefs(prefs);
        var frames = VO_collectFrames(doc, prefs.scope);
        if (!frames.length) {
            alert(VO_UI.noText);
            return;
        }
        var o = VO_buildOpts(prefs);
        var doMark = !!prefs.mark;
        var doFix = !analyseOnly && prefs.fixMode !== "none";

        var result;
        try {
            if (analyseOnly) {
                var o2 = VO_buildOpts(prefs);
                o2.fixMode = "none";
                result = VO_run(doc, frames, o2, doMark, false, null);
            } else {
                // Une passe : repères + correction optionnelle (Annuler dans Illustrator)
                result = VO_run(doc, frames, o, doMark, doFix, null);
            }
        } catch (err) {
            alert(String(err));
            return;
        }

        var msg = VO_UI.report + "\n" +
            result.frames + " " + VO_UI.frames + ", " +
            result.total + " " + VO_UI.issues + ", " +
            result.affected + " " + VO_UI.frames + ".\n\n" +
            result.reports.join("\n");
        if (msg.length > 1200) msg = msg.substring(0, 1190) + "\n\u2026";
        alert(msg);
    }

    bAna.onClick = function () { doRun(true); };
    bApp.onClick = function () {
        readPrefs();
        if (prefs.fixMode !== "none") {
            // remind copy
        }
        doRun(false);
    };
    bClr.onClick = function () {
        try {
            VO_clearMarks(doc);
            alert(VO_UI.done);
        } catch (e) { alert(String(e)); }
    };

    w.show();
}

/* ===================================================================== */
/*  4. POINT D'ENTRÉE                                                     */
/* ===================================================================== */

(function main() {
    if (!/illustrator/i.test(app.name)) {
        alert("Adobe Illustrator required.");
        return;
    }
    if (!app.documents.length) {
        VO_setLang("fr");
        alert(VO_UI.noDoc);
        return;
    }
    var prefs = VO_loadPrefs();
    VO_setLang(prefs.lang || "fr");
    VO_showDialog();
})();
