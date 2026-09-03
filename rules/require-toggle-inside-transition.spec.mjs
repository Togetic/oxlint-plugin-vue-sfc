import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./require-toggle-inside-transition.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "rtt");
afterEach(cleanup);

describe("vue-require-toggle-inside-transition", () => {
    it("reports a Transition whose child has no toggle", () => {
        assert.equal(lintTemplate("<Transition><div>x</div></Transition>").length, 1);
    });

    it("passes a child with v-if", () => {
        assert.equal(lintTemplate('<Transition><div v-if="a">x</div></Transition>').length, 0);
    });

    it("passes a child with v-show", () => {
        assert.equal(lintTemplate('<Transition><div v-show="a">x</div></Transition>').length, 0);
    });

    it("passes a dynamic <component :is> child", () => {
        assert.equal(lintTemplate('<Transition><component :is="C" /></Transition>').length, 0);
    });

    it("matches the lowercase <transition> spelling", () => {
        assert.equal(lintTemplate("<transition><div>x</div></transition>").length, 1);
    });

    it("ignores TransitionGroup entirely (it animates list membership, not toggles)", () => {
        // ESLint flags no TransitionGroup case, not even a static child. Treating it like
        // <Transition> produced a false positive on a real v-for list in this repo.
        assert.equal(lintTemplate("<TransitionGroup><div>x</div></TransitionGroup>").length, 0);
        assert.equal(
            lintTemplate('<TransitionGroup><div v-for="i in a" :key="i">x</div></TransitionGroup>')
                .length,
            0,
        );
    });

    it("is satisfied when ANY child toggles", () => {
        assert.equal(
            lintTemplate('<Transition><div v-if="a">x</div><div>y</div></Transition>').length,
            0,
        );
    });

    it("skips an empty Transition (different problem, would be noise)", () => {
        assert.equal(lintTemplate("<Transition></Transition>").length, 0);
    });

    it("skips a Transition with only whitespace/comment children", () => {
        assert.equal(lintTemplate("<Transition>\n    <!-- c -->\n</Transition>").length, 0);
    });

    it("does NOT count a toggle nested deeper than the direct child", () => {
        assert.equal(
            lintTemplate('<Transition><div><span v-if="a">x</span></div></Transition>').length,
            1,
        );
    });

    it("does not count a toggle on the Transition itself", () => {
        assert.equal(lintTemplate('<Transition v-if="a"><div>x</div></Transition>').length, 1);
    });

    it("passes <Transition appear> with static content (appear animates on initial render)", () => {
        // Regression: without this exemption the rule produced 10 false positives on the real
        // corpus, every one a legitimate appear-animation. ESLint does not flag these either.
        assert.equal(lintTemplate("<Transition appear><div>x</div></Transition>").length, 0);
    });

    it("passes <Transition :appear=\"cond\"> (bound form)", () => {
        assert.equal(lintTemplate('<Transition :appear="a"><div>x</div></Transition>').length, 0);
    });

    it("still reports a plain <Transition> alongside an appear one", () => {
        assert.equal(
            lintTemplate(
                "<div><Transition appear><b>a</b></Transition><Transition><i>b</i></Transition></div>",
            ).length,
            1,
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
