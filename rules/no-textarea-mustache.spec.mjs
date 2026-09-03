import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-textarea-mustache.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "ntm");
afterEach(cleanup);

describe("vue-no-textarea-mustache", () => {
    it("reports an interpolation inside <textarea>", () => {
        assert.equal(lintTemplate("<textarea>{{ value }}</textarea>").length, 1);
    });

    it("passes <textarea> with v-model", () => {
        assert.equal(lintTemplate('<textarea v-model="value" />').length, 0);
    });

    it("passes <textarea> with static text", () => {
        assert.equal(lintTemplate("<textarea>plain</textarea>").length, 0);
    });

    it("passes interpolation in a non-textarea element", () => {
        assert.equal(lintTemplate("<div>{{ value }}</div>").length, 0);
    });

    it("reports each interpolation separately", () => {
        assert.equal(lintTemplate("<textarea>{{ a }}{{ b }}</textarea>").length, 2);
    });

    it("finds a nested <textarea> deeper in the tree", () => {
        assert.equal(lintTemplate("<div><p><textarea>{{ v }}</textarea></p></div>").length, 1);
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
