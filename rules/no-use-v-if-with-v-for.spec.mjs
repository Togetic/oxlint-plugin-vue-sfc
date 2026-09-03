import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-use-v-if-with-v-for.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "nvv");
afterEach(cleanup);

describe("vue-no-use-v-if-with-v-for", () => {
    it("reports v-if and v-for on the same element", () => {
        assert.equal(
            lintTemplate('<li v-for="u in users" v-if="u.active" :key="u.id">x</li>').length,
            1,
        );
    });

    it("reports even when the condition does not use the iteration variable", () => {
        // Vue 3 evaluates v-if first regardless, so the pattern is broken either way.
        assert.equal(
            lintTemplate('<li v-for="u in users" v-if="show" :key="u.id">x</li>').length,
            1,
        );
    });

    it("passes v-if on a wrapping template with v-for on the child", () => {
        assert.equal(
            lintTemplate(
                '<template v-if="show"><li v-for="u in users" :key="u.id">x</li></template>',
            ).length,
            0,
        );
    });

    it("passes v-for alone", () => {
        assert.equal(lintTemplate('<li v-for="u in users" :key="u.id">x</li>').length, 0);
    });

    it("passes v-if alone", () => {
        assert.equal(lintTemplate('<li v-if="show">x</li>').length, 0);
    });

    it("does not flag v-else-if with v-for (different rule, different semantics)", () => {
        assert.equal(
            lintTemplate('<li v-for="u in users" v-else-if="a" :key="u.id">x</li>').length,
            0,
        );
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });
});
