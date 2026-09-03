import {
    NODE_ELEMENT,
    findDirective,
    findKeyProp,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-template-key` (no native oxlint equivalent — oxc#15761).
 *
 * `<template>` is not rendered, so a `key` on it has nothing to identify. Vue either
 * ignores it or warns, and the developer's intent (keying the rendered children) is
 * silently unmet.
 *
 * The one legitimate exception, and it is the common case in Vue 3: `<template v-for>`
 * DOES take the key, precisely because the template stands in for each iteration. So
 * this rule flags `key` on `<template>` only when the template carries no `v-for`.
 * Flagging the v-for case would contradict vue-require-v-for-key, which requires it.
 */

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow `key` attribute on `<template>` without `v-for`",
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
                    if (node.type !== NODE_ELEMENT || node.tag !== "template") {
                        return;
                    }
                    const key = findKeyProp(node);
                    // `<template v-for :key>` is the Vue 3 idiom and is required by
                    // vue-require-v-for-key — never flag it.
                    if (!key || findDirective(node, "for")) {
                        return;
                    }
                    reportAtFileOffset(
                        context,
                        entry,
                        key.loc.start.offset,
                        key.loc.end.offset,
                        "`<template>` is not rendered, so a `key` on it identifies nothing. Move the key to the rendered child element, or put `v-for` on this `<template>` if you meant to key the iteration.",
                    );
                });
            },
        };
    },
};
