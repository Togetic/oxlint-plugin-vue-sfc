import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createScriptLinter } from "../test-helpers.mjs";
import rule from "./require-valid-default-prop.mjs";

const { lintScript } = createScriptLinter(rule);

/** Wrap prop entries in a defineProps call. */
function props(entries) {
    return `const p = defineProps({\n${entries}\n});\n`;
}

describe("vue-require-valid-default-prop", () => {
    it("reports a bare array default (shared between instances)", () => {
        const reports = lintScript(props("    a: { type: Array, default: [] },"));
        assert.equal(reports.length, 1);
        assert.equal(reports[0].messageId, "mustBeFactory");
    });

    it("reports a bare object default", () => {
        assert.equal(lintScript(props("    b: { type: Object, default: {} },")).length, 1);
    });

    it("passes an array factory", () => {
        assert.equal(lintScript(props("    c: { type: Array, default: () => [] },")).length, 0);
    });

    it("passes matching primitive defaults", () => {
        assert.equal(
            lintScript(
                props(
                    "    d: { type: String, default: 's' },\n" +
                        "    e: { type: Number, default: 0 },\n" +
                        "    g: { type: Boolean, default: false },",
                ),
            ).length,
            0,
        );
    });

    it("passes a factory for a primitive type", () => {
        assert.equal(lintScript(props("    f: { type: String, default: () => 's' },")).length, 0);
    });

    it("passes a Function type with a function default", () => {
        assert.equal(
            lintScript(props("    h: { type: Function, default: () => {} },")).length,
            0,
        );
    });

    it("passes a null default for a reference type", () => {
        assert.equal(lintScript(props("    i: { type: Array, default: null },")).length, 0);
    });

    it("reports a primitive type mismatch", () => {
        const reports = lintScript(props("    a: { type: String, default: 1 },"));
        assert.equal(reports.length, 1);
        assert.equal(reports[0].messageId, "typeMismatch");
        assert.match(reports[0].data.expected, /a string/);
    });

    it("reports Number/string and Boolean/string mismatches", () => {
        assert.equal(lintScript(props("    b: { type: Number, default: 'x' },")).length, 1);
        assert.equal(lintScript(props("    c: { type: Boolean, default: 'no' },")).length, 1);
    });

    it("accepts a union type satisfied by any member", () => {
        assert.equal(
            lintScript(props("    d: { type: [String, Number], default: 1 },")).length,
            0,
        );
    });

    it("checks the FACTORY's return type", () => {
        // `() => ({})` for an Array prop returns the wrong shape.
        const reports = lintScript(props("    e: { type: Array, default: () => ({}) },"));
        assert.equal(reports.length, 1);
        assert.equal(reports[0].messageId, "typeMismatch");
    });

    it("passes a prop with a default but no declared type", () => {
        assert.equal(lintScript(props("    f: { default: 1 },")).length, 0);
    });

    it("passes a prop with a type but no default", () => {
        assert.equal(lintScript(props("    g: { type: String },")).length, 0);
    });

    it("stays quiet on a default it cannot type statically", () => {
        // A default pulled from a constant or call is common; reporting it would be wrong.
        assert.equal(lintScript(props("    h: { type: Array, default: EMPTY },")).length, 0);
        assert.equal(lintScript(props("    i: { type: String, default: makeIt() },")).length, 0);
    });

    it("stays quiet on a factory whose return is not statically typed", () => {
        assert.equal(lintScript(props("    j: { type: Array, default: () => build() },")).length, 0);
    });

    it("handles a negative number default", () => {
        assert.equal(lintScript(props("    k: { type: Number, default: -1 },")).length, 0);
    });

    it("handles a template-literal default as a string", () => {
        assert.equal(lintScript(props("    l: { type: String, default: `x` },")).length, 0);
    });

    it("also covers the Options API `props: { … }` form", () => {
        assert.equal(
            lintScript("export default { props: { a: { type: Array, default: [] } } };\n").length,
            1,
        );
    });

    it("does nothing when there are no props", () => {
        assert.equal(lintScript("const x = 1;\n").length, 0);
    });
});
