import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./v-on-event-hyphenation.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "voh");
afterEach(cleanup);

describe("vue-v-on-event-hyphenation", () => {
    it("reports a camelCase event on a component", () => {
        assert.equal(lintTemplate('<MyThing @myEvent="go" />').length, 1);
    });

    it("passes a hyphenated event on a component", () => {
        assert.equal(lintTemplate('<MyThing @my-event="go" />').length, 0);
    });

    it("passes a lowercase event on a component", () => {
        assert.equal(lintTemplate('<MyThing @change="go" />').length, 0);
    });

    it("ignores camelCase events on plain HTML elements", () => {
        // Native DOM events are lowercase; renaming them is not Vue's business.
        assert.equal(lintTemplate('<div @myEvent="go" />').length, 0);
    });

    it("ignores a dynamic event name", () => {
        assert.equal(lintTemplate('<MyThing @[evt]="go" />').length, 0);
    });

    it("ignores an argument-less v-on spread", () => {
        assert.equal(lintTemplate('<MyThing v-on="handlers" />').length, 0);
    });

    it("suggests the hyphenated form in the message", () => {
        const [report] = lintTemplate('<MyThing @myLongEvent="go" />');
        assert.match(report.message, /@my-long-event/);
    });

    it("handles v-on:longhand", () => {
        assert.equal(lintTemplate('<MyThing v-on:myEvent="go" />').length, 1);
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });
});
