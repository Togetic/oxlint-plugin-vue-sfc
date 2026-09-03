import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import rule from "./no-raw-text.mjs";

let counter = 0;
const tmpFiles = [];

// Write an arbitrary SFC to a temp file and run the rule against it. Use this directly when a test
// needs control over block order — e.g. a template-first SFC with a non-empty script (the repo
// norm), the only layout that exercises reportAtFileOffset's negative-offset [template L:C] path.
function lintSource(source, options) {
    const filename = path.join(os.tmpdir(), `nrt-${process.pid}-${counter++}.vue`);
    fs.writeFileSync(filename, source, "utf8");
    tmpFiles.push(filename);
    const reports = [];
    rule.create({ filename, options, report: (d) => reports.push(d) }).Program?.();
    return reports;
}

// Convenience wrapper: lint `templateInner` inside a minimal script-first SFC.
function lintTemplate(templateInner, options) {
    return lintSource(
        `<script setup lang="ts"></script>\n<template>\n    ${templateInner}\n</template>\n`,
        options,
    );
}

afterEach(() => {
    while (tmpFiles.length) {
        try {
            fs.unlinkSync(tmpFiles.pop());
        } catch {
            // best-effort temp cleanup
        }
    }
});

describe("vue-no-raw-text", () => {
    it("reports prose with a lowercase word", () => {
        assert.equal(lintTemplate("<div>Buy now</div>").length, 1);
    });

    it("reports text adjacent to an interpolation", () => {
        assert.equal(lintTemplate("<span>{{ count }} items</span>").length, 1);
    });

    it("passes interpolation-only content ($t)", () => {
        assert.equal(lintTemplate("<div>{{ $t('x') }}</div>").length, 0);
    });

    it("skips all-caps tickers / acronyms (no lowercase letter)", () => {
        assert.equal(lintTemplate("<div>BTC</div>").length, 0);
        assert.equal(lintTemplate("<span>OK</span>").length, 0);
    });

    it("skips numbers, symbols and single letters", () => {
        assert.equal(lintTemplate("<div>1,234.56 %</div>").length, 0);
        assert.equal(lintTemplate("<i>x</i>").length, 0);
    });

    it("skips whitespace-only text", () => {
        assert.equal(lintTemplate("<div>   </div>").length, 0);
    });

    it("skips text inside default-ignored tags (pre/code)", () => {
        assert.equal(lintTemplate("<pre>hello world</pre>").length, 0);
    });

    it("skips text nested inside default-ignored tags", () => {
        assert.equal(lintTemplate("<pre><span>hello world</span></pre>").length, 0);
    });

    it("honours the ignorePattern option", () => {
        assert.equal(lintTemplate("<span>WhiteBIT</span>").length, 1);
        assert.equal(
            lintTemplate("<span>WhiteBIT</span>", [{ ignorePattern: "^WhiteBIT$" }]).length,
            0,
        );
    });

    it("does nothing for a template with no text (cheap path)", () => {
        assert.equal(lintTemplate('<img :src="src" />').length, 0);
    });

    it("prepends the real [template line:column] for a template-first SFC (the repo norm)", () => {
        // Template-first + a NON-EMPTY script: the text sits BEFORE the script block, so its file
        // offset is negative and reportAtFileOffset takes the [template L:C] fallback. This is the
        // layout of every real .vue here, yet lintTemplate's script-first wrapper never reaches it.
        const reports = lintSource(
            "<template>\n    <div>Buy now</div>\n</template>\n" +
                '<script setup lang="ts">\nconst x = 1;\n</script>\n',
        );
        assert.equal(reports.length, 1);
        // "Buy now" is on template line 2, column 10 (4-space indent + "<div>").
        assert.match(reports[0].message, /^\[template 2:10\] /);
        assert.match(reports[0].message, /Buy now/);
    });

    it("honours a custom ignoreTags option", () => {
        assert.equal(lintTemplate("<foo>hello world</foo>", [{ ignoreTags: ["foo"] }]).length, 0);
    });

    it("custom ignoreTags REPLACES the defaults (pre is no longer ignored)", () => {
        // new Set(opts.ignoreTags ?? DEFAULT_IGNORE_TAGS) replaces, not merges — lock that in so a
        // future "merge with defaults" refactor fails loudly rather than silently changing scope.
        assert.equal(lintTemplate("<pre>hello world</pre>", [{ ignoreTags: ["foo"] }]).length, 1);
    });

    it("flags accented lowercase prose but skips all-caps accented strings", () => {
        // Guards the deliberate \p{Ll}/\p{L} choice over ASCII [a-z] — the strings this rule exists
        // to catch include localized prose (es/tr/de) touched by the same migration.
        assert.equal(lintTemplate("<div>Información</div>").length, 1);
        assert.equal(lintTemplate("<div>über uns</div>").length, 1);
        assert.equal(lintTemplate("<div>ÚÑÍ</div>").length, 0);
    });

    it("flags raw text in every v-if / v-else-if / v-else branch", () => {
        assert.equal(
            lintTemplate(
                '<div><span v-if="a">Hello there</span>' +
                    '<span v-else-if="b">Goodbye now</span>' +
                    "<span v-else>Farewell friend</span></div>",
            ).length,
            3,
        );
    });

    it("truncates a long snippet to 39 chars + ellipsis", () => {
        const long = "this is a very long piece of prose that exceeds forty characters";
        const [report] = lintTemplate(`<div>${long}</div>`);
        const snippet = report.message.match(/"([^"]*)"/)[1];
        assert.ok(snippet.endsWith("…"));
        assert.equal(snippet.length, 40); // 39 source chars + the ellipsis
    });

    it("returns no visitor for non-.vue files (the rule is registered globally)", () => {
        const visitor = rule.create({ filename: "foo.ts", options: undefined, report() {} });
        assert.deepEqual(Object.keys(visitor), []);
    });

    it("does nothing for a script-only SFC (no template AST)", () => {
        assert.equal(lintSource('<script setup lang="ts">\nconst x = 1;\n</script>\n').length, 0);
    });
});
