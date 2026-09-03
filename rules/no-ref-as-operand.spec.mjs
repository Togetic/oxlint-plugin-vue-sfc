import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createScriptLinter } from "oxlint-vue-sfc-harness/test-helpers";
import rule from "./no-ref-as-operand.mjs";

const { lintScript } = createScriptLinter(rule);

/** Prefix every fixture with the ref declarations the rule needs to see. */
function withRefs(body) {
    return `import { ref, computed, shallowRef } from "vue";\nconst c = ref(0);\nconst d = computed(() => 1);\nconst s = shallowRef(2);\nconst plain = 5;\nlet m = 0;\n${body}\n`;
}

describe("vue-no-ref-as-operand", () => {
    it("reports a ref in a binary expression", () => {
        assert.equal(lintScript(withRefs("const x = c + 1;")).length, 1);
    });

    it("reports a ref in a comparison", () => {
        assert.equal(lintScript(withRefs("const x = c > 0;")).length, 1);
    });

    it("reports a ref compared to undefined", () => {
        assert.equal(lintScript(withRefs("const x = c === undefined;")).length, 1);
    });

    it("reports a ref under a unary operator", () => {
        assert.equal(lintScript(withRefs("const x = !c;")).length, 1);
        assert.equal(lintScript(withRefs("const x = -c;")).length, 1);
        assert.equal(lintScript(withRefs("const x = typeof c;")).length, 1);
    });

    it("reports a ref in logical expressions, including ??", () => {
        assert.equal(lintScript(withRefs("const x = c && true;")).length, 1);
        assert.equal(lintScript(withRefs("const x = c || 1;")).length, 1);
        assert.equal(lintScript(withRefs("const x = c ?? 1;")).length, 1);
    });

    it("reports a ref as a conditional test", () => {
        assert.equal(lintScript(withRefs("const x = c ? 1 : 2;")).length, 1);
    });

    it("reports a ref as an if test", () => {
        assert.equal(lintScript(withRefs("if (c) { globalThis.x = 1; }")).length, 1);
    });

    it("reports a ref as a switch discriminant", () => {
        assert.equal(lintScript(withRefs("switch (c) { default: break; }")).length, 1);
    });

    it("reports a ref in a template literal substitution", () => {
        assert.equal(lintScript(withRefs("const x = `n=${c}`;")).length, 1);
    });

    it("reports a ref on the right of a COMPOUND assignment", () => {
        assert.equal(lintScript(withRefs("m += c;")).length, 1);
    });

    it("treats computed() and shallowRef() as refs too", () => {
        assert.equal(lintScript(withRefs("const x = d + 1;")).length, 1);
        assert.equal(lintScript(withRefs("const y = s + 1;")).length, 1);
    });

    it("passes .value access", () => {
        assert.equal(lintScript(withRefs("const x = c.value + 1;")).length, 0);
    });

    it("passes a non-ref variable", () => {
        assert.equal(lintScript(withRefs("const x = plain + 1;")).length, 0);
    });

    it("passes a ref passed as a call argument (idiomatic)", () => {
        assert.equal(lintScript(withRefs("globalThis.fn?.(c);")).length, 0);
        assert.equal(lintScript(withRefs("const x = String(c);")).length, 0);
    });

    it("passes a ref in an array or object literal (sharing reactivity)", () => {
        assert.equal(lintScript(withRefs("const x = [c];")).length, 0);
        assert.equal(lintScript(withRefs("const x = { k: c };")).length, 0);
    });

    it("passes PLAIN assignment of a ref (stores the ref itself)", () => {
        // Deliberate parity with eslint-plugin-vue: `m = c` is not reported, `m += c` is.
        assert.equal(lintScript(withRefs("m = c;")).length, 0);
    });

    it("passes while / for tests (upstream does not report these)", () => {
        // Surprising, but matching upstream matters more than internal consistency — being
        // stricter than ESLint would break the parity guarantee this port rests on.
        assert.equal(lintScript(withRefs("while (c) { break; }")).length, 0);
        assert.equal(lintScript(withRefs("for (let i = 0; c; i++) { break; }")).length, 0);
    });

    it("does nothing when the file declares no refs (cheap path)", () => {
        assert.equal(lintScript("const a = 1;\nconst b = a + 1;\n").length, 0);
    });

    it("names the offending ref in the message data", () => {
        const [report] = lintScript(withRefs("const x = c + 1;"));
        assert.equal(report.data.name, "c");
        assert.equal(report.messageId, "refAsOperand");
    });

    it("respects shadowing: an inner non-ref binding is NOT reported", () => {
        // Regression for the 14 false positives a name-only resolver produced on the real repo:
        // a module-scope ref plus an inner-scope const of the same name from a plain call.
        assert.equal(
            lintScript(
                'import { ref } from "vue";\n' +
                    "const giveTicker = ref(\"\");\n" +
                    "function go(p) {\n" +
                    "    const giveTicker = parseParam(p);\n" +
                    "    if (giveTicker) { return 1; }\n" +
                    "    return 0;\n" +
                    "}\n",
            ).length,
            0,
        );
    });

    it("still reports the OUTER ref when no inner binding shadows it", () => {
        assert.equal(
            lintScript(
                'import { ref } from "vue";\n' +
                    "const t = ref(\"\");\n" +
                    "function go() {\n" +
                    "    if (t) { return 1; }\n" +
                    "    return 0;\n" +
                    "}\n",
            ).length,
            1,
        );
    });

    it("respects a shadowing function PARAMETER", () => {
        assert.equal(
            lintScript(
                'import { ref } from "vue";\nconst c = ref(0);\nfunction f(c) { return c + 1; }\n',
            ).length,
            0,
        );
    });

    it("reports both operands when two refs are combined", () => {
        assert.equal(lintScript(withRefs("const x = c + d;")).length, 2);
    });
});
