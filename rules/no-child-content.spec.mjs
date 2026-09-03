import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-child-content.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "ncc");
afterEach(cleanup);

describe("vue-no-child-content", () => {
    it("reports text content under v-text", () => {
        assert.equal(lintTemplate('<p v-text="msg">dead</p>').length, 1);
    });

    it("reports element content under v-html", () => {
        assert.equal(lintTemplate('<div v-html="html"><span>dead</span></div>').length, 1);
    });

    it("reports an interpolation child under v-text", () => {
        assert.equal(lintTemplate('<p v-text="msg">{{ other }}</p>').length, 1);
    });

    it("passes v-text with no children", () => {
        assert.equal(lintTemplate('<p v-text="msg" />').length, 0);
    });

    it("passes v-text with only whitespace children (formatting, not content)", () => {
        assert.equal(lintTemplate('<p v-text="msg">\n    </p>').length, 0);
    });

    it("passes v-text with only a comment child (renders nothing)", () => {
        assert.equal(lintTemplate('<p v-text="msg"><!-- note --></p>').length, 0);
    });

    it("passes children with no v-text / v-html", () => {
        assert.equal(lintTemplate("<p>live content</p>").length, 0);
    });

    it("reports once per element, spanning first to last child", () => {
        assert.equal(lintTemplate('<p v-text="m">a<span>b</span>c</p>').length, 1);
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
