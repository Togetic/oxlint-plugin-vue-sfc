import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./require-component-is.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "rci");
afterEach(cleanup);

describe("vue-require-component-is", () => {
    it("reports <component> with no is", () => {
        assert.equal(lintTemplate("<component />").length, 1);
    });

    it("passes <component :is>", () => {
        assert.equal(lintTemplate('<component :is="Comp" />').length, 0);
    });

    it("passes <component v-bind:is> longhand", () => {
        assert.equal(lintTemplate('<component v-bind:is="Comp" />').length, 0);
    });

    it("passes a static is attribute (unusual but it does render)", () => {
        assert.equal(lintTemplate('<component is="MyComp" />').length, 0);
    });

    it("passes an argument-less v-bind spread (is may come from the object)", () => {
        assert.equal(lintTemplate('<component v-bind="props" />').length, 0);
    });

    it("ignores other elements without is", () => {
        assert.equal(lintTemplate("<div />").length, 0);
    });

    it("reports each bare <component> independently", () => {
        assert.equal(lintTemplate("<div><component /><component /></div>").length, 2);
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
