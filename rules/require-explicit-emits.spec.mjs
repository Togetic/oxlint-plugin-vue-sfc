import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createSfcLinter } from "../test-helpers.mjs";
import rule from "./require-explicit-emits.mjs";

const { lintSfc, cleanup } = createSfcLinter(rule, "ree");
afterEach(cleanup);

function sfc(templateInner, scriptBody) {
    return `<template>\n    ${templateInner}\n</template>\n<script setup lang="ts">\n${scriptBody}\n</script>\n`;
}

const TYPE_DECL = 'const emit = defineEmits<{ declared: []; other: [] }>();';

describe("vue-require-explicit-emits", () => {
    it("reports an undeclared $emit in the template", () => {
        assert.equal(
            lintSfc(sfc('<button @click="$emit(\'nope\')">x</button>', TYPE_DECL)).length,
            1,
        );
    });

    it("passes a declared $emit in the template", () => {
        assert.equal(
            lintSfc(sfc('<button @click="$emit(\'declared\')">x</button>', TYPE_DECL)).length,
            0,
        );
    });

    it("reports an undeclared emit() via the script variable in the template", () => {
        assert.equal(
            lintSfc(sfc('<button @click="emit(\'nope\')">x</button>', TYPE_DECL)).length,
            1,
        );
    });

    it("reports an undeclared emit() in the script", () => {
        assert.equal(
            lintSfc(sfc("<div />", `${TYPE_DECL}\nfunction go() { emit("nope"); }\ngo();`)).length,
            1,
        );
    });

    it("passes a declared emit() in the script", () => {
        assert.equal(
            lintSfc(sfc("<div />", `${TYPE_DECL}\nfunction go() { emit("other"); }\ngo();`)).length,
            0,
        );
    });

    it("handles the runtime array declaration form", () => {
        assert.equal(
            lintSfc(
                sfc('<button @click="$emit(\'b\')">x</button>', 'const emit = defineEmits(["a"]);'),
            ).length,
            1,
        );
        assert.equal(
            lintSfc(
                sfc('<button @click="$emit(\'a\')">x</button>', 'const emit = defineEmits(["a"]);'),
            ).length,
            0,
        );
    });

    it("handles the runtime object declaration form", () => {
        assert.equal(
            lintSfc(
                sfc('<button @click="$emit(\'a\')">x</button>', "const emit = defineEmits({ a: null });"),
            ).length,
            0,
        );
    });

    it("handles the Options API emits array", () => {
        assert.equal(
            lintSfc(sfc('<button @click="$emit(\'b\')">x</button>', 'export default { emits: ["a"] };'))
                .length,
            1,
        );
    });

    it("stays SILENT when there is no declaration at all", () => {
        // Reporting every emit in an undeclared component is a different rule's job.
        assert.equal(lintSfc(sfc('<button @click="$emit(\'x\')">x</button>', "const a = 1;")).length, 0);
    });

    it("skips a dynamic event name", () => {
        assert.equal(
            lintSfc(sfc('<button @click="$emit(name)">x</button>', TYPE_DECL)).length,
            0,
        );
    });

    it("reports each undeclared emit separately", () => {
        assert.equal(
            lintSfc(
                sfc(
                    '<div><button @click="$emit(\'p\')">1</button><button @click="$emit(\'q\')">2</button></div>',
                    TYPE_DECL,
                ),
            ).length,
            2,
        );
    });

    it("names the event in the message", () => {
        const [report] = lintSfc(sfc('<button @click="$emit(\'nope\')">x</button>', TYPE_DECL));
        assert.match(report.message, /"nope"/);
    });

    it("finds emits inside an interpolation", () => {
        assert.equal(lintSfc(sfc("<div>{{ $emit('nope') }}</div>", TYPE_DECL)).length, 1);
    });

    it("handles the CALL-SIGNATURE type form (the dominant style in this repo)", () => {
        // Regression for 219 false positives: `defineEmits<{ (e: "x"): void }>()` has no property
        // keys, so reading only TSPropertySignature left the declared set EMPTY and flagged
        // every emit in 122+ SFCs.
        const decl = 'const emit = defineEmits<{ (event: "edit", p: string): void }>();';
        assert.equal(lintSfc(sfc('<button @click="$emit(\'edit\')">x</button>', decl)).length, 0);
        assert.equal(lintSfc(sfc('<button @click="$emit(\'nope\')">x</button>', decl)).length, 1);
    });

    it("resolves a NAMED type reference declared locally (interface)", () => {
        const decl = 'interface MyEmits { (e: "copy"): void }\nconst emit = defineEmits<MyEmits>();';
        assert.equal(lintSfc(sfc('<button @click="$emit(\'copy\')">x</button>', decl)).length, 0);
        assert.equal(lintSfc(sfc('<button @click="$emit(\'nope\')">x</button>', decl)).length, 1);
    });

    it("resolves a NAMED type reference declared locally (type alias)", () => {
        const decl = 'type MyEmits = { (e: "copy"): void };\nconst emit = defineEmits<MyEmits>();';
        assert.equal(lintSfc(sfc('<button @click="$emit(\'copy\')">x</button>', decl)).length, 0);
        // Also assert the NEGATIVE case, so this cannot pass merely by the rule going silent.
        assert.equal(lintSfc(sfc('<button @click="$emit(\'nope\')">x</button>', decl)).length, 1);
    });

    it("stays SILENT for an UNRESOLVABLE named type reference", () => {
        // An imported interface cannot be resolved from one file. Silence beats flagging
        // every emit in the component.
        const decl = 'import type { Ext } from "./e";\nconst emit = defineEmits<Ext>();';
        assert.equal(lintSfc(sfc('<button @click="$emit(\'whatever\')">x</button>', decl)).length, 0);
    });

    it("returns no visitor for non-.vue files", () => {
        assert.deepEqual(
            Object.keys(rule.create({ filename: "a.ts", options: undefined, report() {} })),
            [],
        );
    });
});
