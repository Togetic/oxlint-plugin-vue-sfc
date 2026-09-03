import {
    NODE_ELEMENT,
    findDirective,
    findKeyProp,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/require-v-for-key` (no native oxlint equivalent — oxlint's 46
 * native vue rules are all script-side; every template-AST rule still lives in the
 * ESLint fallback, see packages/eslint-config/libs/vue.mjs and oxc#15761).
 *
 * A `v-for` without a `key` makes Vue reuse DOM nodes by index, so component state
 * (focus, input values, transition state) leaks across list items when the list is
 * reordered or filtered. It is a correctness bug, not a style preference, which is
 * why this ships as `error`.
 *
 * Vue 3 semantics, and the false-positive guards that matter here:
 * - The key belongs on the element carrying `v-for`, INCLUDING `<template v-for>`.
 * - For `<template v-for>` we also accept a key on every direct element child. That
 *   is the Vue 2 idiom and still works in Vue 3, so flagging it would report working
 *   code — and one false positive on a 1500-SFC codebase costs more trust than the
 *   marginal rule strictness buys.
 * - `findKeyProp` accepts both the static `key` attribute and `:key` / `v-bind:key`.
 * - `<template v-for>` with no element children (text only) cannot carry a keyed
 *   child, so it is judged on its own key alone.
 */

export default {
    meta: {
        type: "problem",
        docs: {
            description: "require `v-bind:key` with `v-for` directives",
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
                    if (node.type !== NODE_ELEMENT || !findDirective(node, "for")) {
                        return;
                    }
                    if (findKeyProp(node)) {
                        return;
                    }
                    // `<template v-for>`: a key on every direct element child is the Vue 2
                    // idiom and still correct in Vue 3, so treat it as satisfied.
                    if (node.tag === "template") {
                        const elementChildren = (node.children ?? []).filter(
                            (child) => child.type === NODE_ELEMENT,
                        );
                        if (elementChildren.length && elementChildren.every(findKeyProp)) {
                            return;
                        }
                    }
                    reportAtFileOffset(
                        context,
                        entry,
                        node.loc.start.offset,
                        node.loc.end.offset,
                        `<${node.tag}> uses v-for without a :key. Vue reuses DOM nodes by index without one, so item state leaks when the list is reordered or filtered.`,
                    );
                });
            },
        };
    },
};
