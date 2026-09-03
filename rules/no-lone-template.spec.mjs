import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-lone-template.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "nlt");
afterEach(cleanup);

describe("vue-no-lone-template", () => {
    it("reports a <template> with no directive", () => {
        assert.equal(lintTemplate("<template><li>x</li></template>").length, 1);
    });

    it("passes <template v-if>", () => {
        assert.equal(lintTemplate('<template v-if="a"><li>x</li></template>').length, 0);
    });

    it("passes <template v-for>", () => {
        assert.equal(
            lintTemplate('<template v-for="i in a" :key="i"><li>x</li></template>').length,
            0,
        );
    });

    it("passes <template #slot> shorthand", () => {
        assert.equal(lintTemplate('<template #default="{ a }">{{ a }}</template>').length, 0);
    });

    it("passes <template v-slot:name> longhand", () => {
        assert.equal(lintTemplate("<template v-slot:footer>x</template>").length, 0);
    });

    it("a static attribute does NOT rescue a lone template", () => {
        assert.equal(lintTemplate('<template class="row"><li>x</li></template>').length, 1);
    });

    it("never flags the SFC's own <template> block (it is a ROOT node, not an element)", () => {
        assert.equal(lintTemplate("<div>plain</div>").length, 0);
    });

    it("finds a lone template nested deeper", () => {
        assert.equal(lintTemplate("<div><template><li>x</li></template></div>").length, 1);
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
