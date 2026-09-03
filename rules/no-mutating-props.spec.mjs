import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createSfcLinter } from "../test-helpers.mjs";
import rule from "./no-mutating-props.mjs";

const { lintSfc, cleanup } = createSfcLinter(rule, "nmp");
afterEach(cleanup);

const DECL = 'const props = defineProps<{ count: number; name: string; obj: { a: number } }>();';

function sfc(templateInner, scriptBody = DECL) {
    return `<template>\n    ${templateInner}\n</template>\n<script setup lang="ts">\n${scriptBody}\n</script>\n`;
}

describe("vue-no-mutating-props", () => {
    it("reports a script assignment to a prop", () => {
        assert.equal(lintSfc(sfc("<div />", `${DECL}\nprops.count = 1;`)).length, 1);
    });

    it("reports a NESTED script assignment (Vue does not even warn at runtime)", () => {
        assert.equal(lintSfc(sfc("<div />", `${DECL}\nprops.obj.a = 2;`)).length, 1);
    });

    it("reports a script increment of a prop", () => {
        assert.equal(lintSfc(sfc("<div />", `${DECL}\nprops.count++;`)).length, 1);
    });

    it("reports a compound script assignment", () => {
        assert.equal(lintSfc(sfc("<div />", `${DECL}\nprops.count += 1;`)).length, 1);
    });

    it("reports a template increment", () => {
        assert.equal(lintSfc(sfc('<button @click="props.count++">x</button>')).length, 1);
    });

    it("reports a template v-model on a prop", () => {
        assert.equal(lintSfc(sfc('<input v-model="props.name" />')).length, 1);
    });

    it("reports v-model with an argument on a prop", () => {
        assert.equal(lintSfc(sfc('<Child v-model:foo="props.name" />')).length, 1);
    });

    it("reports a mutation of a DESTRUCTURED prop", () => {
        assert.equal(
            lintSfc(sfc("<div />", "const { count } = defineProps<{ count: number }>();\ncount++;"))
                .length,
            1,
        );
    });

    it("passes reading a prop in the template", () => {
        assert.equal(lintSfc(sfc("<div>{{ props.count }}</div>")).length, 0);
    });

    it("passes comparing a prop", () => {
        assert.equal(lintSfc(sfc('<div v-if="props.count === 1">x</div>')).length, 0);
        assert.equal(lintSfc(sfc('<div v-if="props.count >= 1">x</div>')).length, 0);
        assert.equal(lintSfc(sfc('<div v-if="props.count != 1">x</div>')).length, 0);
    });

    it("passes calling a method on a prop", () => {
        assert.equal(lintSfc(sfc('<div>{{ props.name.trim() }}</div>')).length, 0);
    });

    it("passes assigning FROM a prop", () => {
        assert.equal(lintSfc(sfc("<div />", `${DECL}\nlet local = 0;\nlocal = props.count;`)).length, 0);
    });

    it("passes mutating a local, not a prop", () => {
        assert.equal(lintSfc(sfc("<div />", `${DECL}\nlet local = 0;\nlocal++;`)).length, 0);
    });

    it("passes v-model on a local ref", () => {
        assert.equal(
            lintSfc(sfc('<input v-model="local" />', `${DECL}\nconst local = ref("");`)).length,
            0,
        );
    });

    it("does NOT trigger on the word 'props' inside a string literal", () => {
        assert.equal(lintSfc(sfc('<div :title="\'props = ok\'">x</div>')).length, 0);
    });

    it("does NOT trigger on the word 'props' inside a comment", () => {
        assert.equal(lintSfc(sfc('<div v-if="/* props = 1 */ true">x</div>')).length, 0);
    });

    it("handles withDefaults(defineProps(), …)", () => {
        assert.equal(
            lintSfc(
                sfc(
                    "<div />",
                    "const props = withDefaults(defineProps<{ a: number }>(), { a: 1 });\nprops.a = 2;",
                ),
            ).length,
            1,
        );
    });

    it("does nothing when the component declares no props", () => {
        assert.equal(lintSfc(sfc('<button @click="x.count++">y</button>', "let x = { count: 0 };")).length, 0);
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });
});
