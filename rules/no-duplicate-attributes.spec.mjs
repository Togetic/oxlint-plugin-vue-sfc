import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-duplicate-attributes.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "nda");
afterEach(cleanup);

describe("vue-no-duplicate-attributes", () => {
    it("reports two static attributes with the same name", () => {
        assert.equal(lintTemplate('<div id="a" id="b">x</div>').length, 1);
    });

    it("reports static + bound duplicate for a non-mergeable attribute", () => {
        assert.equal(lintTemplate('<img src="a.png" :src="b" />').length, 1);
    });

    it("reports two bound duplicates", () => {
        assert.equal(lintTemplate('<img :src="a" :src="b" />').length, 1);
    });

    it("allows static class + bound :class (Vue merges them)", () => {
        assert.equal(lintTemplate('<div class="a" :class="b">x</div>').length, 0);
    });

    it("allows static style + bound :style (Vue merges them)", () => {
        assert.equal(lintTemplate('<div style="color:red" :style="s">x</div>').length, 0);
    });

    it("still reports TWO static class attributes (merge only spans static/bound)", () => {
        assert.equal(lintTemplate('<div class="a" class="b">x</div>').length, 1);
    });

    it("still reports TWO bound :class attributes", () => {
        assert.equal(lintTemplate('<div :class="a" :class="b">x</div>').length, 1);
    });

    it("resolves v-bind:longhand to its argument name", () => {
        assert.equal(lintTemplate('<img src="a.png" v-bind:src="b" />').length, 1);
    });

    it("ignores an argument-less v-bind spread (no single name)", () => {
        assert.equal(lintTemplate('<div v-bind="a" v-bind="b">x</div>').length, 0);
    });

    it("ignores duplicate non-bind directives (different semantics, other rules' job)", () => {
        assert.equal(lintTemplate('<button @click="a" @click="b">x</button>').length, 0);
    });

    it("reports once per extra occurrence, so a triple yields two", () => {
        assert.equal(lintTemplate('<div id="a" id="b" id="c">x</div>').length, 2);
    });

    it("scopes per element, not per template", () => {
        assert.equal(lintTemplate('<div id="a"></div><div id="a"></div>').length, 0);
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
