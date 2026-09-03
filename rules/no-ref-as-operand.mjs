import { walkWithScopes } from "../utils/js-scope.mjs";

/**
 * Replacement for `vue/no-ref-as-operand` (no native oxlint equivalent — this one is on oxc's
 * roadmap as script-based-and-feasible but had no PR as of oxlint 1.78; see OXLINT_MIGRATION.md).
 *
 * `const count = ref(0)` then `count + 1` operates on the ref OBJECT, not its value. There is no
 * type error in plain JS and TypeScript often can't save you either (`Ref<number> + number`
 * widens to `string` via valueOf/toString in some positions), so it ships as `"[object Object]1"`
 * or `NaN`. The fix is always `.value`.
 *
 * Unlike the template rules in this plugin, this is a SCRIPT rule: oxlint hands JS plugins the
 * real script AST, so there is no SFC self-parsing, no `reportAtFileOffset`, and positions are
 * already correct — this rule does not depend on oxc#20501 at all.
 *
 * The reported contexts were derived EMPIRICALLY from eslint-plugin-vue, because the set is not
 * what you would guess. Confirmed flagged: binary and logical operands (including `??`), unary
 * arguments (`!`, `-`, `typeof`), a conditional's test, `if` test, `switch` discriminant,
 * template-literal substitutions, and the right side of a COMPOUND assignment (`m += c`).
 * Confirmed NOT flagged, and deliberately left alone:
 * - `while (c)` and `for (;c;)` tests — surprising, but matching upstream matters more than
 *   consistency, and being stricter than ESLint would break the parity guarantee.
 * - plain assignment `m = c` — assigning the ref itself is a normal thing to do.
 * - call arguments `fn(c)`, array/object literals `[c]` / `{ k: c }` — passing the ref around
 *   is the idiomatic way to share reactivity.
 * - `c.value` in any position.
 *
 * Ref detection resolves through LEXICAL SCOPE (utils/js-scope.mjs), not by name alone. That
 * distinction is not academic: a name-only first cut produced 14 false positives on this repo,
 * every one the same shape — a module-scope `const x = ref(…)` plus an inner-scope
 * `const x = someCall(…)`, where the inner, non-ref binding was being reported. Shadowing has
 * to be respected for this rule to be usable at all.
 *
 * Remaining limits, inherited from the scope helper and all failing toward false negatives:
 * aliased/re-exported ref factories are not followed, `var` is treated as block-scoped, and
 * there is no hoisting. See utils/js-scope.mjs.
 */

const REF_FACTORIES = new Set(["ref", "computed", "shallowRef", "customRef", "toRef"]);

function isRefFactoryCall(init) {
    return (
        init?.type === "CallExpression" &&
        init.callee?.type === "Identifier" &&
        REF_FACTORIES.has(init.callee.name)
    );
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "require `.value` when using a `ref` as an operand",
            recommended: true,
        },
        schema: [],
        messages: {
            refAsOperand:
                "`{{name}}` is a ref, so this operates on the ref object rather than its value. Use `{{name}}.value`.",
        },
    },
    create(context) {
        return {
            Program(program) {
                const report = (candidate, lookup) => {
                    if (candidate?.type !== "Identifier") {
                        return;
                    }
                    // `true` only when the NEAREST binding is a ref; a shadowing non-ref
                    // binding yields `false`, an unbound name `undefined`.
                    if (lookup(candidate.name) !== true) {
                        return;
                    }
                    context.report({
                        node: candidate,
                        messageId: "refAsOperand",
                        data: { name: candidate.name },
                    });
                };

                walkWithScopes(program, isRefFactoryCall, (node, lookup) => {
                    switch (node.type) {
                        case "BinaryExpression":
                        case "LogicalExpression":
                            report(node.left, lookup);
                            report(node.right, lookup);
                            break;
                        case "UnaryExpression":
                            report(node.argument, lookup);
                            break;
                        case "ConditionalExpression":
                            report(node.test, lookup);
                            break;
                        case "IfStatement":
                            report(node.test, lookup);
                            break;
                        case "SwitchStatement":
                            report(node.discriminant, lookup);
                            break;
                        case "TemplateLiteral":
                            for (const expression of node.expressions ?? []) {
                                report(expression, lookup);
                            }
                            break;
                        case "AssignmentExpression":
                            // Compound only: `m += c` reads c's value, `m = c` stores the ref.
                            if (node.operator !== "=") {
                                report(node.right, lookup);
                            }
                            break;
                        default:
                            break;
                    }
                });
            },
        };
    },
};
