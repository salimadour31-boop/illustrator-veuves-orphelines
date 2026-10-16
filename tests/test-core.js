/**
 * Tests du cœur VO_CORE (sans Illustrator).
 * Lancer : node tests/test-core.js
 */
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "DetecterVeuvesOrphelines.jsx"), "utf8");
// Extrait le bloc VO_CORE
var m = src.match(/var VO_CORE = \(function \(\) \{[\s\S]*?\n\}\)\(\);/);
if (!m) { console.error("VO_CORE not found"); process.exit(1); }
eval(m[0]);

var passed = 0, failed = 0;
function ok(cond, name) {
    if (cond) { passed++; console.log("  OK  " + name); }
    else { failed++; console.log(" FAIL " + name); }
}

console.log("=== VO_CORE unit tests ===");

ok(VO_CORE.wordCount("un deux trois") === 3, "wordCount 3");
ok(VO_CORE.wordCount("  a  ") === 1, "wordCount trim");
ok(VO_CORE.wordCount("") === 0, "wordCount empty");
ok(VO_CORE.charCountVisible("abc") === 3, "charCount");
ok(VO_CORE.charCountVisible("  a b  ") === 3, "charCount spaces trimmed content");

ok(Math.abs(VO_CORE.lineRatio(30, 100) - 0.3) < 1e-9, "lineRatio 30%");
ok(VO_CORE.lineRatio(0, 100) === 0, "lineRatio zero width");
ok(VO_CORE.lineRatio(50, 0) === 1, "lineRatio zero measure → 1");
ok(VO_CORE.lineRatio(120, 100) === 1, "lineRatio capped at 1");

var short1 = VO_CORE.classifyShortLast(
    { width: 20, measure: 100, text: "fin", words: 1, chars: 3, paraLines: 4 },
    { maxRatio: 0.33, maxWords: 2, minChars: 12, useRatio: true, useWords: true, useChars: true }
);
ok(short1.short === true, "short last line flagged");
ok(short1.reasons.indexOf("ratio") >= 0, "reason ratio");
ok(short1.reasons.indexOf("words") >= 0, "reason words");
ok(short1.reasons.indexOf("chars") >= 0, "reason chars");

var long1 = VO_CORE.classifyShortLast(
    { width: 90, measure: 100, text: "une ligne assez longue pour passer", words: 6, chars: 34, paraLines: 3 },
    { maxRatio: 0.33, maxWords: 2, minChars: 12 }
);
ok(long1.short === false, "long last line not flagged");

var single = VO_CORE.classifyShortLast(
    { width: 10, measure: 100, text: "x", words: 1, chars: 1, paraLines: 1 },
    { maxRatio: 0.33, maxWords: 2, minChars: 12 }
);
ok(single.short === false, "single-line paragraph not a widow");

var col1 = VO_CORE.classifyColumnBreaks([{ col: 0 }, { col: 1 }, { col: 1 }]);
ok(col1.orphan === true, "orphan: first alone in col 0");
ok(col1.widowCol === false, "not widowCol when last shares col");

var col2 = VO_CORE.classifyColumnBreaks([{ col: 0 }, { col: 0 }, { col: 1 }]);
ok(col2.orphan === false, "not orphan when first shares col");
ok(col2.widowCol === true, "widowCol: last alone in col 1");

var col3 = VO_CORE.classifyColumnBreaks([{ col: 0 }, { col: 0 }, { col: 0 }]);
ok(col3.orphan === false && col3.widowCol === false, "single column no column issues");

var col4 = VO_CORE.classifyColumnBreaks([{ col: 0 }, { col: 1 }]);
ok(col4.orphan === true && col4.widowCol === true, "two lines two cols → both");

var lefts = VO_CORE.columnLefts(0, 220, 2, 20);
ok(lefts.length === 2, "2 column lefts");
ok(Math.abs(lefts[0] - 0) < 1e-9, "col0 left");
ok(Math.abs(lefts[1] - 120) < 1e-9, "col1 left = colW+gutter");

ok(VO_CORE.columnIndex(0, lefts, 2) === 0, "columnIndex 0");
ok(VO_CORE.columnIndex(120, lefts, 2) === 1, "columnIndex 1");
ok(VO_CORE.columnIndex(5, lefts, 2) === 0, "columnIndex near 0");

var paraShort = {
    lines: [
        { width: 100, measure: 100, text: "Ligne une complete ici", left: 0, top: 100, bot: 90, col: 0 },
        { width: 100, measure: 100, text: "Ligne deux complete aussi", left: 0, top: 88, bot: 78, col: 0 },
        { width: 18, measure: 100, text: "fin", left: 0, top: 76, bot: 66, col: 0 }
    ]
};
var iss = VO_CORE.analyseParagraph(paraShort, {
    doShort: true, doColumns: true, maxRatio: 0.33, maxWords: 2, minChars: 12,
    useRatio: true, useWords: true, useChars: true
});
ok(iss.length === 1 && iss[0].kind === "short", "analyseParagraph short last");

var paraOrph = {
    lines: [
        { width: 50, measure: 100, text: "Seule en haut", left: 0, top: 100, bot: 90, col: 0 },
        { width: 90, measure: 100, text: "suite colonne suivante", left: 120, top: 200, bot: 190, col: 1 },
        { width: 90, measure: 100, text: "encore", left: 120, top: 188, bot: 178, col: 1 }
    ]
};
var iss2 = VO_CORE.analyseParagraph(paraOrph, { doShort: false, doColumns: true });
ok(iss2.length === 1 && iss2[0].kind === "orphan", "analyseParagraph orphan");

var paraBoth = {
    lines: [
        { width: 90, measure: 100, text: "debut colonne 0", left: 0, top: 100, bot: 90, col: 0 },
        { width: 90, measure: 100, text: "milieu", left: 0, top: 88, bot: 78, col: 0 },
        { width: 15, measure: 100, text: "oui", left: 120, top: 200, bot: 190, col: 1 }
    ]
};
var iss3 = VO_CORE.analyseParagraph(paraBoth, {
    doShort: true, doColumns: true, maxRatio: 0.33, maxWords: 2, minChars: 12,
    useRatio: true, useWords: true, useChars: false
});
ok(iss3.length === 1 && iss3[0].kind === "short+widowCol", "short merged with widowCol");

ok(VO_CORE.excerpt("abcdef", 4) === "abc\u2026" || VO_CORE.excerpt("abcdef", 4).length === 4, "excerpt truncates");

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
