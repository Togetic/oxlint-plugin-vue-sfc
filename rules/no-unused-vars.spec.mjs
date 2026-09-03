import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createLinter } from "../test-helpers.mjs";
import rule from "./no-unused-vars.mjs";

const { lintSource, lintTemplate, cleanup } = createLinter(rule, "nuv");
afterEach(cleanup);

describe("vue-no-unused-vars", () => {
    it("reports an unused v-for alias", () => {
        assert.equal(lintTemplate('<li v-for="item in items">x</li>').length, 1);
    });

    it("passes a used v-for alias", () => {
        assert.equal(lintTemplate('<li v-for="item in items">{{ item }}</li>').length, 0);
    });

    it("reports only the unused alias of a (value, index) pair", () => {
        const reports = lintTemplate('<li v-for="(item, i) in items">{{ item }}</li>');
        assert.equal(reports.length, 1);
        assert.match(reports[0].message, /`i` is defined/);
    });

    it("v-for is POSITIONAL: an unused alias BEFORE a used one is not reported", () => {
        // Regression for 5 real false positives, all `(_, index)` skeleton loops. Upstream
        // applies after-used logic to v-for aliases because their position is fixed.
        assert.equal(lintTemplate('<li v-for="(_, index) in items">{{ index }}</li>').length, 0);
        assert.equal(lintTemplate('<li v-for="(a, i, k) in items">{{ k }}</li>').length, 0);
    });

    it("v-for reports every alias when NONE is used", () => {
        assert.equal(lintTemplate('<li v-for="(a, i) in items">z</li>').length, 2);
    });

    it("v-for reports only aliases after the last used one", () => {
        assert.equal(lintTemplate('<li v-for="(a, i, k) in items">{{ i }}</li>').length, 1);
    });

    it("v-slot is NOT positional: an unused binding before a used one IS reported", () => {
        assert.equal(lintTemplate('<template #d="{ a, b }">{{ b }}</template>').length, 1);
        assert.equal(lintTemplate('<template #e="{ a, b }">{{ a }}</template>').length, 1);
    });

    it("passes when both aliases are used", () => {
        assert.equal(
            lintTemplate('<li v-for="(item, i) in items">{{ item }}{{ i }}</li>').length,
            0,
        );
    });

    it("reports an unused v-slot destructured prop", () => {
        assert.equal(lintTemplate('<template #default="{ a }">x</template>').length, 1);
    });

    it("passes a used v-slot destructured prop", () => {
        assert.equal(lintTemplate('<template #other="{ b }">{{ b }}</template>').length, 0);
    });

    it("does NOT exempt underscore (upstream default ignores nothing)", () => {
        // eslint-plugin-vue has an ignorePattern option, but its default ignores nothing and our
        // config never set one. An underscore escape hatch here would silently diverge.
        assert.equal(lintTemplate('<li v-for="_ in items">x</li>').length, 1);
    });

    it("counts a use in a nested child", () => {
        assert.equal(
            lintTemplate('<li v-for="row in items"><span>{{ row }}</span></li>').length,
            0,
        );
    });

    it("counts a use inside an attribute binding", () => {
        assert.equal(lintTemplate('<li v-for="o in items" :key="o.id">x</li>').length, 0);
    });

    it("counts a use in a dynamic argument", () => {
        assert.equal(lintTemplate('<li v-for="k in items" :[k]="1">x</li>').length, 0);
    });

    it("handles object-pattern renames (binding is the right-hand name)", () => {
        assert.equal(
            lintTemplate('<li v-for="{ a: renamed } in items">{{ renamed }}</li>').length,
            0,
        );
        assert.equal(lintTemplate('<li v-for="{ a: renamed } in items">x</li>').length, 1);
    });

    it("handles a destructuring default (binding is the left-hand name)", () => {
        assert.equal(lintTemplate('<li v-for="{ a = 1 } in items">{{ a }}</li>').length, 0);
    });

    it("does not treat `in` / `of` as bindings", () => {
        assert.equal(lintTemplate('<li v-for="x of items">{{ x }}</li>').length, 0);
    });

    it("does not flag the iterated source as a binding", () => {
        // `items` is on the right of `in`, so it is never a binding.
        const reports = lintTemplate('<li v-for="item in items">x</li>');
        assert.equal(reports.length, 1);
        assert.doesNotMatch(reports[0].message, /`items`/);
    });

    it("reports each unused alias across sibling v-fors", () => {
        assert.equal(
            lintTemplate('<div><li v-for="a in x">1</li><li v-for="b in y">2</li></div>').length,
            2,
        );
    });

    it("handles <template v-for> keyed by the alias", () => {
        assert.equal(
            lintTemplate('<template v-for="x in items" :key="x"><span>1</span></template>').length,
            0,
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
