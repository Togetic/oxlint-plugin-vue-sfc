import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-template-key.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "ntk");
afterEach(cleanup);

describe("vue-no-template-key", () => {
    it("reports key on a plain <template>", () => {
        assert.equal(lintTemplate('<template :key="x"><li>a</li></template>').length, 1);
    });

    it("reports a static key attribute on <template>", () => {
        assert.equal(lintTemplate('<template key="x"><li>a</li></template>').length, 1);
    });

    it("passes key on `<template v-for>` (Vue 3 idiom, required by vue-require-v-for-key)", () => {
        assert.equal(
            lintTemplate('<template v-for="i in items" :key="i.id"><li>a</li></template>').length,
            0,
        );
    });

    it("passes <template> with no key", () => {
        assert.equal(lintTemplate("<template><li>a</li></template>").length, 0);
    });

    it("passes key on a normal element", () => {
        assert.equal(lintTemplate('<li :key="x">a</li>').length, 0);
    });

    it("passes key on <template v-slot> without v-for", () => {
        // A slot template legitimately has no key; guard that we only look at `key`.
        assert.equal(lintTemplate('<template #default="{ a }">{{ a }}</template>').length, 0);
    });

    it("reports key on <template v-if> (no v-for, so the key identifies nothing)", () => {
        assert.equal(lintTemplate('<template v-if="a" :key="k"><li>x</li></template>').length, 1);
    });

    it("prepends the real [template line:column] for a template-first SFC", () => {
        const reports = lintSource(
            '<template>\n    <template :key="k"><li>x</li></template>\n</template>\n' +
                '<script setup lang="ts">\nconst k = 1;\n</script>\n',
        );
        assert.equal(reports.length, 1);
        assert.match(reports[0].message, /^\[template 2:15\] /);
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
