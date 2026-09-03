import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./this-in-template.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "tit");
afterEach(cleanup);

describe("vue-this-in-template", () => {
    it("reports this.x in an interpolation", () => {
        assert.equal(lintTemplate("<div>{{ this.count }}</div>").length, 1);
    });

    it("reports this in a directive expression", () => {
        assert.equal(lintTemplate('<div :title="this.title" />').length, 1);
    });

    it("passes a plain binding", () => {
        assert.equal(lintTemplate("<div>{{ count }}</div>").length, 0);
    });

    it("does NOT flag the word 'this' inside a single-quoted string", () => {
        // The false positive that would get this rule switched off: user-facing copy.
        assert.equal(lintTemplate("<div :title=\"'use this instead'\" />").length, 0);
    });

    it("does NOT flag the word 'this' inside a double-quoted string", () => {
        assert.equal(lintTemplate("<div>{{ 'this one' }}</div>").length, 0);
    });

    it("does NOT flag 'this' in template-literal text", () => {
        assert.equal(lintTemplate("<div>{{ `this thing` }}</div>").length, 0);
    });

    it("DOES flag this inside a ${...} substitution", () => {
        assert.equal(lintTemplate("<div>{{ `n=${this.n}` }}</div>").length, 1);
    });

    it("does not flag identifiers merely containing 'this'", () => {
        assert.equal(lintTemplate("<div>{{ things }}</div>").length, 0);
        assert.equal(lintTemplate("<div>{{ isThis }}</div>").length, 0);
    });

    it("handles an escaped quote without losing the terminator", () => {
        assert.equal(lintTemplate("<div>{{ 'it\\'s this' }}</div>").length, 0);
    });

    it("does NOT flag 'this' inside a /* block comment */ in an expression", () => {
        // Regression: the real corpus has a v-if whose multi-line comment explains behaviour in
        // prose containing "this". That was the rule's only corpus hit, and it was spurious.
        assert.equal(
            lintTemplate('<li v-if="/* selected while this tab shows */ a && b">x</li>').length,
            0,
        );
    });

    it("does NOT flag 'this' inside a // line comment in an expression", () => {
        assert.equal(lintTemplate('<li v-if="a // this one\n">x</li>').length, 0);
    });

    it("still flags real this alongside a comment mentioning this", () => {
        assert.equal(lintTemplate('<li v-if="/* this note */ this.a">x</li>').length, 1);
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });

    it("does nothing for a script-only SFC", () => {
        assert.equal(lintSource('<script setup lang="ts">\nconst x = 1;\n</script>\n').length, 0);
    });
});
