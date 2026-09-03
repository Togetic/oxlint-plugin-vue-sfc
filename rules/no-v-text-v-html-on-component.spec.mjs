import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-v-text-v-html-on-component.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "nvc");
afterEach(cleanup);

describe("vue-no-v-text-v-html-on-component", () => {
    it("reports v-text on a PascalCase component", () => {
        assert.equal(lintTemplate('<MyThing v-text="msg" />').length, 1);
    });

    it("reports v-html on a component", () => {
        assert.equal(lintTemplate('<MyThing v-html="html" />').length, 1);
    });

    it("passes v-text on a plain HTML element", () => {
        assert.equal(lintTemplate('<p v-text="msg" />').length, 0);
    });

    it("passes v-html on a plain HTML element", () => {
        assert.equal(lintTemplate('<div v-html="html" />').length, 0);
    });

    it("passes a component with no v-text / v-html", () => {
        assert.equal(lintTemplate('<MyThing :msg="msg" />').length, 0);
    });

    it("reports <component :is> carrying v-text (parser marks it a component)", () => {
        assert.equal(lintTemplate('<component :is="C" v-text="m" />').length, 1);
    });

    it("uses the parser's tagType rather than a casing heuristic", () => {
        // A kebab-case tag that is NOT a known HTML element parses as a component, so the
        // casing heuristic this rule deliberately avoids would have missed it.
        assert.equal(lintTemplate('<my-thing v-text="m" />').length, 1);
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
