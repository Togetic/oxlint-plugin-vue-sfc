import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createSfcLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-unused-components.mjs";

const { lintSfc, cleanup } = createSfcLinter(rule, "nuc");
afterEach(cleanup);

/** Options API SFC — the only shape upstream inspects. */
function optionsSfc(templateInner, scriptBody) {
    return `<template>\n    ${templateInner}\n</template>\n<script lang="ts">\n${scriptBody}\n</script>\n`;
}

describe("vue-no-unused-components", () => {
    it("reports a registered component never used in the template", () => {
        assert.equal(
            lintSfc(
                optionsSfc("<div><Used /></div>", "export default { components: { Used, Unused } };"),
            ).length,
            1,
        );
    });

    it("passes when every registration is used", () => {
        assert.equal(
            lintSfc(
                optionsSfc("<div><Used /><Other /></div>", "export default { components: { Used, Other } };"),
            ).length,
            0,
        );
    });

    it("matches kebab-case usage against PascalCase registration", () => {
        assert.equal(
            lintSfc(optionsSfc("<div><used-two /></div>", "export default { components: { UsedTwo } };"))
                .length,
            0,
        );
    });

    it("matches lowercase usage against PascalCase registration", () => {
        assert.equal(
            lintSfc(optionsSfc("<div><used /></div>", "export default { components: { Used } };")).length,
            0,
        );
    });

    it("suppresses entirely when a dynamic <component :is> is present", () => {
        // ignoreWhenBindingPresent defaults to true: the binding could be any registration.
        assert.equal(
            lintSfc(
                optionsSfc(
                    '<div><Used /><component :is="x" /></div>',
                    "export default { components: { Used, Unused } };",
                ),
            ).length,
            0,
        );
    });

    it("does NOT suppress on a static is attribute", () => {
        assert.equal(
            lintSfc(
                optionsSfc(
                    '<div><Used /><component is="div" /></div>',
                    "export default { components: { Used, Unused } };",
                ),
            ).length,
            1,
        );
    });

    it("handles export default defineComponent({ … })", () => {
        assert.equal(
            lintSfc(
                optionsSfc(
                    "<div><Used /></div>",
                    "export default defineComponent({ components: { Used, Unused } });",
                ),
            ).length,
            1,
        );
    });

    it("is inert for <script setup> (upstream inspects only Options API)", () => {
        // The entire reason this rule reports nothing in this repo: every SFC is <script setup>,
        // where an unused component import is @typescript-eslint/no-unused-vars' business.
        assert.equal(
            lintSfc(
                '<template>\n    <div><Used /></div>\n</template>\n' +
                    '<script setup lang="ts">\nimport Used from "./a.vue";\nimport Unused from "./b.vue";\n</script>\n',
            ).length,
            0,
        );
    });

    it("does nothing when there is no components registration", () => {
        assert.equal(lintSfc(optionsSfc("<div />", "export default { name: 'X' };")).length, 0);
    });

    it("names the offending component in the message data", () => {
        const [report] = lintSfc(
            optionsSfc("<div><Used /></div>", "export default { components: { Used, Unused } };"),
        );
        assert.equal(report.data.name, "Unused");
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });
});
