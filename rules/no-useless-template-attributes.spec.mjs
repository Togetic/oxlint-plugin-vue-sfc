import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-useless-template-attributes.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "nut");
afterEach(cleanup);

describe("vue-no-useless-template-attributes", () => {
    it("reports a static class on <template v-if>", () => {
        assert.equal(lintTemplate('<template v-if="a" class="row"><li>x</li></template>').length, 1);
    });

    it("reports a v-bind on <template v-if>", () => {
        assert.equal(lintTemplate('<template v-if="a" :id="i"><li>x</li></template>').length, 1);
    });

    it("reports a v-on on <template v-for>", () => {
        assert.equal(
            lintTemplate('<template v-for="i in a" :key="i" @click="go">x</template>').length,
            1,
        );
    });

    it("passes a bare <template v-if>", () => {
        assert.equal(lintTemplate('<template v-if="a"><li>x</li></template>').length, 0);
    });

    it("passes key together with v-for (the Vue 3 iteration key)", () => {
        assert.equal(
            lintTemplate('<template v-for="i in a" :key="i"><li>x</li></template>').length,
            0,
        );
    });

    it("stays silent on a lone <template> (vue-no-lone-template owns that)", () => {
        assert.equal(lintTemplate('<template class="row"><li>x</li></template>').length, 0);
    });

    it("stays silent on key without v-for (vue-no-template-key owns that)", () => {
        assert.equal(lintTemplate('<template v-if="a" :key="k"><li>x</li></template>').length, 0);
    });

    it("passes v-slot on a slot template", () => {
        assert.equal(lintTemplate('<template #default="{ a }">{{ a }}</template>').length, 0);
    });

    it("reports each useless attribute separately", () => {
        assert.equal(
            lintTemplate('<template v-if="a" class="r" id="i"><li>x</li></template>').length,
            2,
        );
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
