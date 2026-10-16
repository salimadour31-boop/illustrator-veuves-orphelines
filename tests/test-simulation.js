/**
 * Simulations d'objets texte Illustrator (sans AI).
 * Lancer : node tests/test-simulation.js
 */
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "DetecterVeuvesOrphelines.jsx"), "utf8");
var m = src.match(/var VO_CORE = \(function \(\) \{[\s\S]*?\n\}\)\(\);/);
if (!m) { console.error("VO_CORE not found"); process.exit(1); }
eval(m[0]);

var passed = 0, failed = 0;
function ok(cond, name) {
    if (cond) { passed++; console.log("  OK  " + name); }
    else { failed++; console.log(" FAIL " + name); }
}

console.log("=== VO simulation tests ===");

// Simule un cadre 2 colonnes avec orpheline + ligne courte
function fakeFrame(paras) {
    return { paragraphs: paras, contents: paras.map(function (p) {
        return p.lines.map(function (l) { return l.text; }).join(" ");
    }).join("\r") };
}

var measure = 100;
var p1 = {
    lines: [
        { width: 40, measure: measure, text: "Orpheline", words: 1, chars: 9, left: 0, top: 200, bot: 190, col: 0 },
        { width: 95, measure: measure, text: "Le reste du paragraphe continue ici tranquillement", words: 7, chars: 48, left: 120, top: 200, bot: 190, col: 1 },
        { width: 95, measure: measure, text: "sur plusieurs lignes dans la seconde colonne", words: 7, chars: 44, left: 120, top: 188, bot: 178, col: 1 },
        { width: 12, measure: measure, text: "fin", words: 1, chars: 3, left: 120, top: 176, bot: 166, col: 1 }
    ]
};

var issues = VO_CORE.analyseParagraph(p1, {
    doShort: true, doColumns: true, maxRatio: 0.33, maxWords: 2, minChars: 12,
    useRatio: true, useWords: true, useChars: true
});
var kinds = issues.map(function (x) { return x.kind; }).sort().join(",");
ok(issues.length >= 2, "orphan frame has ≥2 issues (got " + issues.length + ")");
ok(kinds.indexOf("orphan") >= 0, "has orphan");
ok(kinds.indexOf("short") >= 0 || kinds.indexOf("short+widowCol") >= 0, "has short/widowCol");

// Cadre sain
var pOk = {
    lines: [
        { width: 98, measure: 100, text: "Premiere ligne bien remplie de mots", words: 5, chars: 35, left: 0, top: 100, bot: 90, col: 0 },
        { width: 96, measure: 100, text: "Deuxieme ligne egalement bien remplie", words: 5, chars: 37, left: 0, top: 88, bot: 78, col: 0 },
        { width: 70, measure: 100, text: "Troisieme ligne encore correcte ici", words: 5, chars: 35, left: 0, top: 76, bot: 66, col: 0 }
    ]
};
var issOk = VO_CORE.analyseParagraph(pOk, {
    doShort: true, doColumns: true, maxRatio: 0.33, maxWords: 2, minChars: 12,
    useRatio: true, useWords: true, useChars: true
});
ok(issOk.length === 0, "healthy paragraph clean");

// Seuil ratio seul
var pRatio = {
    lines: [
        { width: 100, measure: 100, text: "aaaaaaaaaaaaaaaaaaaa", words: 1, chars: 20, left: 0, top: 10, bot: 0, col: 0 },
        { width: 40, measure: 100, text: "bbbbbbbbbbbbbbbbbbbb", words: 1, chars: 20, left: 0, top: 0, bot: -10, col: 0 }
    ]
};
var issR = VO_CORE.analyseParagraph(pRatio, {
    doShort: true, doColumns: false, maxRatio: 0.5, maxWords: 1, minChars: 5,
    useRatio: true, useWords: false, useChars: false
});
ok(issR.length === 1 && Math.abs(issR[0].ratio - 0.4) < 0.01, "ratio-only detection at 40%");

// columnLefts 3 cols
var L = VO_CORE.columnLefts(10, 320, 3, 10);
ok(L.length === 3, "3 cols");
ok(Math.abs(L[0] - 10) < 1e-6, "col0");
ok(Math.abs(L[1] - (10 + 100 + 10)) < 1e-6, "col1");
ok(Math.abs(L[2] - (10 + 2 * (100 + 10))) < 1e-6, "col2");

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
