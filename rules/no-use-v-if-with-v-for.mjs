import {
    NODE_ELEMENT,
    findDirective,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-use-v-if-with-v-for` (no native oxlint equivalent — oxc#15761).
 *
 * `v-if` and `v-for` on the SAME element: in Vue 3 `v-if` has the higher priority, so it is
 * evaluated BEFORE the loop variable exists. `<li v-for="u in users" v-if="u.active">` does
 * not filter the list — it throws or silently reads `undefined`, because `u` is not in scope
 * when the condition runs. (Vue 2 had the opposite precedence, which is why this pattern
 * survives in migrated code and reads as if it works.)
 *
 * The fix is either a computed filtered list, or moving `v-if` to a wrapping `<template>`.
 *
 * Reported unconditionally when both are present, matching eslint-plugin-vue's default
 * (`allowUsingIterationVar: false`). The option that permits it exists for Vue 2 semantics;
 * on Vue 3 the pattern is broken regardless of whether the condition touches the iteration
 * variable, so there is nothing to allow.
 */

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow use of `v-if` on the same element as `v-for`",
            recommended: true,
        },
        schema: [],
        messages: { m: "" },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        return {
            Program() {
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                walkTemplate(ast, (node) => {
                    if (node.type !== NODE_ELEMENT) {
                        return;
                    }
                    const vFor = findDirective(node, "for");
                    const vIf = findDirective(node, "if");
                    if (!vFor || !vIf) {
                        return;
                    }
                    // Anchor on the `v-if` DIRECTIVE, not its expression: that is where
                    // eslint-plugin-vue points (verified at exact column parity).
                    reportAtFileOffset(
                        context,
                        entry,
                        vIf.loc.start.offset,
                        vIf.loc.end.offset,
                        `\`v-if\` on the same element as \`v-for\` runs BEFORE the loop variable exists (v-if has higher priority in Vue 3), so this does not filter the list. Use a computed filtered list, or move the \`v-if\` to a wrapping <template>.`,
                    );
                });
            },
        };
    },
};
