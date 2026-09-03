import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./use-v-on-exact.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "uvoe");
afterEach(cleanup);

describe("vue-use-v-on-exact", () => {
    it("reports a bare handler paired with a system-modifier handler", () => {
        assert.equal(lintTemplate('<button @click="a" @click.ctrl="b" />').length, 1);
    });

    it("passes when both handlers carry system modifiers", () => {
        assert.equal(lintTemplate('<button @click.ctrl="a" @click.shift="b" />').length, 0);
    });

    it("passes a lone bare handler", () => {
        assert.equal(lintTemplate('<button @click="a" />').length, 0);
    });

    it("passes a lone system-modifier handler", () => {
        assert.equal(lintTemplate('<button @click.ctrl="a" />').length, 0);
    });

    it("passes handlers for different events", () => {
        assert.equal(lintTemplate('<button @click="a" @keyup.ctrl="b" />').length, 0);
    });

    it("passes when the bare handler already has .exact", () => {
        assert.equal(lintTemplate('<button @click.exact="a" @click.ctrl="b" />').length, 0);
    });

    it("does not treat non-system modifiers as conflicting", () => {
        // .prevent/.stop/.once are not system modifiers, so there is no double-fire.
        assert.equal(lintTemplate('<button @click="a" @click.prevent="b" />').length, 0);
        assert.equal(lintTemplate('<button @click="a" @click.once="b" />').length, 0);
    });

    it("does not treat key modifiers as system modifiers", () => {
        assert.equal(lintTemplate('<input @keyup="a" @keyup.enter="b" />').length, 0);
    });

    it(".exact on the MODIFIED sibling does not rescue the bare handler", () => {
        assert.equal(lintTemplate('<button @click="a" @click.ctrl.exact="b" />').length, 1);
    });

    it("handles alt and meta as system modifiers", () => {
        assert.equal(lintTemplate('<button @click="a" @click.alt="b" />').length, 1);
        assert.equal(lintTemplate('<button @click="a" @click.meta="b" />').length, 1);
    });

    it("ignores a dynamic event name", () => {
        assert.equal(lintTemplate('<button @[evt]="a" @click.ctrl="b" />').length, 0);
    });

    it("groups per element, not across the template", () => {
        assert.equal(
            lintTemplate('<button @click="a" /><button @click.ctrl="b" />').length,
            0,
        );
    });

    it("reports each offending bare handler when several share the event", () => {
        assert.equal(
            lintTemplate('<button @click="a" @click="c" @click.ctrl="b" />').length,
            2,
        );
    });

    it("handles v-on: longhand", () => {
        assert.equal(lintTemplate('<button v-on:click="a" v-on:click.ctrl="b" />').length, 1);
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
