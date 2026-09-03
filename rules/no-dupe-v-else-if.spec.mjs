import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-dupe-v-else-if.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "ndv");
afterEach(cleanup);

describe("vue-no-dupe-v-else-if", () => {
    it("reports an exact duplicate condition in a v-if chain", () => {
        assert.equal(
            lintTemplate('<div v-if="a">1</div><div v-else-if="a">2</div>').length,
            1,
        );
    });

    it("passes distinct conditions", () => {
        assert.equal(
            lintTemplate('<div v-if="a">1</div><div v-else-if="b">2</div>').length,
            0,
        );
    });

    it("normalizes whitespace when comparing", () => {
        assert.equal(
            lintTemplate('<div v-if="a && b">1</div><div v-else-if="a   &&   b">2</div>').length,
            1,
        );
    });

    it("reports a duplicate of an earlier v-else-if, not just of the v-if", () => {
        assert.equal(
            lintTemplate(
                '<div v-if="a">1</div><div v-else-if="b">2</div><div v-else-if="b">3</div>',
            ).length,
            1,
        );
    });

    it("does not treat separate chains as one", () => {
        // The plain <hr> breaks the run, so the second `a` starts a fresh chain.
        assert.equal(
            lintTemplate('<div v-if="a">1</div><hr /><div v-if="a">2</div>').length,
            0,
        );
    });

    it("skips whitespace and comments between chain members", () => {
        assert.equal(
            lintTemplate(
                '<div v-if="a">1</div>\n    <!-- c -->\n    <div v-else-if="a">2</div>',
            ).length,
            1,
        );
    });

    it("ignores a v-else-if with no preceding v-if (a different rule's error)", () => {
        assert.equal(lintTemplate('<div v-else-if="a">1</div>').length, 0);
    });

    it("v-else terminates the chain", () => {
        assert.equal(
            lintTemplate(
                '<div v-if="a">1</div><div v-else>2</div><div v-else-if="a">3</div>',
            ).length,
            0,
        );
    });

    it("does NOT detect logical subsets (documented reduced scope)", () => {
        // eslint-plugin-vue flags `a` after `a && b`; we deliberately do not. Lock that in so
        // the limitation is visible rather than looking like a bug.
        assert.equal(
            lintTemplate('<div v-if="a && b">1</div><div v-else-if="a">2</div>').length,
            0,
        );
    });

    it("finds chains nested inside another element", () => {
        assert.equal(
            lintTemplate('<ul><li v-if="a">1</li><li v-else-if="a">2</li></ul>').length,
            1,
        );
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
