import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createSfcLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-template-shadow.mjs";

const { lintSfc, cleanup } = createSfcLinter(rule, "nts");
afterEach(cleanup);

/** Template-first SFC (the repo norm) with a given script body. */
function sfc(templateInner, scriptBody = "const items = [];") {
    return `<template>\n    ${templateInner}\n</template>\n<script setup lang="ts">\n${scriptBody}\n</script>\n`;
}

describe("vue-no-template-shadow", () => {
    it("reports a v-for alias shadowing an enclosing v-for alias", () => {
        assert.equal(
            lintSfc(sfc('<ul v-for="row in items"><li v-for="row in row.kids">{{ row }}</li></ul>'))
                .length,
            1,
        );
    });

    it("reports a v-for alias shadowing a script binding", () => {
        assert.equal(
            lintSfc(
                sfc('<li v-for="scriptVar in items">{{ scriptVar }}</li>', "const items = [];\nconst scriptVar = 1;"),
            ).length,
            1,
        );
    });

    it("passes a fresh alias", () => {
        assert.equal(lintSfc(sfc('<li v-for="item in items">{{ item }}</li>')).length, 0);
    });

    it("passes distinct nested aliases", () => {
        assert.equal(
            lintSfc(sfc('<ul v-for="a in items"><li v-for="b in a">{{ b }}</li></ul>')).length,
            0,
        );
    });

    it("does NOT treat sibling subtrees as shadowing each other", () => {
        // Only ANCESTOR bindings shadow; two siblings may both bind `item`.
        assert.equal(
            lintSfc(
                sfc(
                    '<div><li v-for="item in items">{{ item }}</li>' +
                        '<li v-for="item in items">{{ item }}</li></div>',
                ),
            ).length,
            0,
        );
    });

    it("reports a v-slot binding shadowing a script binding", () => {
        assert.equal(
            lintSfc(
                sfc('<template #d="{ scriptVar }">{{ scriptVar }}</template>', "const scriptVar = 1;"),
            ).length,
            1,
        );
    });

    it("reports a v-slot binding shadowing an enclosing v-for alias", () => {
        assert.equal(
            lintSfc(
                sfc('<ul v-for="row in items"><template #d="{ row }">{{ row }}</template></ul>'),
            ).length,
            1,
        );
    });

    it("counts imports as script bindings", () => {
        assert.equal(
            lintSfc(sfc('<li v-for="ref in items">{{ ref }}</li>', 'import { ref } from "vue";')).length,
            1,
        );
    });

    it("counts function declarations as script bindings", () => {
        assert.equal(
            lintSfc(sfc('<li v-for="go in items">{{ go }}</li>', "function go() {}")).length,
            1,
        );
    });

    it("counts destructured script bindings", () => {
        assert.equal(
            lintSfc(sfc('<li v-for="a in items">{{ a }}</li>', "const { a } = globalThis;")).length,
            1,
        );
    });

    it("reports each shadowing alias of a pair", () => {
        assert.equal(
            lintSfc(
                sfc('<ul v-for="(a, i) in items"><li v-for="(a, i) in a">{{ i }}</li></ul>'),
            ).length,
            2,
        );
    });

    it("distinguishes the two messages", () => {
        const [fromScript] = lintSfc(
            sfc('<li v-for="s in items">{{ s }}</li>', "const s = 1;"),
        );
        assert.match(fromScript.message, /from <script>/);
        const [fromTemplate] = lintSfc(
            sfc('<ul v-for="r in items"><li v-for="r in r.k">{{ r }}</li></ul>'),
        );
        assert.match(fromTemplate.message, /enclosing template scope/);
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });

    it("does nothing for a script-only SFC", () => {
        assert.equal(lintSfc('<script setup lang="ts">\nconst x = 1;\n</script>\n').length, 0);
    });
});
