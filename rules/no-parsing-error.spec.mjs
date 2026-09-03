import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-parsing-error.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "npe");
afterEach(cleanup);

describe("vue-no-parsing-error", () => {
    it("reports an unclosed tag", () => {
        assert.ok(lintSource("<template>\n    <div>\n</template>\n").length >= 1);
    });

    it("passes well-formed markup", () => {
        assert.equal(lintTemplate("<div><span>ok</span></div>").length, 0);
    });

    it("reports a malformed end tag", () => {
        assert.ok(lintSource("<template>\n    <div></span>\n</template>\n").length >= 1);
    });

    it("passes a script-only SFC", () => {
        assert.equal(lintSource('<script setup lang="ts">\nconst x = 1;\n</script>\n').length, 0);
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });
});
