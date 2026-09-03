import {
    NODE_ELEMENT,
    PROP_ATTRIBUTE,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-useless-template-attributes` (no native oxlint equivalent — oxc#15761).
 *
 * `<template>` is not rendered, so most attributes on it go nowhere. `<template v-if="x"
 * class="row">` looks like it styles the row; the class is silently dropped and the author is
 * left debugging CSS that was never applied.
 *
 * The attributes that DO have meaning on a `<template>`:
 * - the structural directives themselves: `v-if`, `v-else-if`, `v-else`, `v-for`, `v-slot`
 *   (`#name`), and `v-pre`.
 * - `key`, but only together with `v-for` — that is the Vue 3 iteration key, required by
 *   vue-require-v-for-key. A `key` WITHOUT `v-for` is handled by vue-no-template-key, so it
 *   is left alone here to avoid two rules reporting the same token.
 *
 * Everything else — static attributes, `v-bind`, `v-on`, `v-model`, `v-show` — is reported.
 * A lone `<template>` with no directive at all is vue-no-lone-template's finding, not this
 * rule's, so this rule only speaks when the template has at least one meaningful directive.
 */

const MEANINGFUL_DIRECTIVES = new Set(["if", "else-if", "else", "for", "slot", "pre"]);

function isKeyProp(prop) {
    if (prop.type === PROP_ATTRIBUTE) {
        return prop.name === "key";
    }
    return (
        prop.name === "bind" &&
        prop.arg?.type === 4 /* SIMPLE_EXPRESSION */ &&
        prop.arg.content === "key"
    );
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow useless attribute on `<template>`",
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
                    const props = node.props ?? [];
                    const structural = props.filter(
                        (prop) =>
                            prop.type === PROP_DIRECTIVE && MEANINGFUL_DIRECTIVES.has(prop.name),
                    );
                    // No structural directive at all → vue-no-lone-template's finding.
                    if (!structural.length) {
                        return;
                    }
                    for (const prop of props) {
                        if (structural.includes(prop)) {
                            continue;
                        }
                        // `key` is meaningful with v-for; without it, vue-no-template-key owns it.
                        if (isKeyProp(prop)) {
                            continue;
                        }
                        const label =
                            prop.type === PROP_ATTRIBUTE ? prop.name : `v-${prop.name}`;
                        reportAtFileOffset(
                            context,
                            entry,
                            prop.loc.start.offset,
                            prop.loc.end.offset,
                            `\`${label}\` has no effect on \`<template>\` — the element is not rendered, so the attribute is silently dropped. Move it to the child element you meant to target.`,
                        );
                    }
                });
            },
        };
    },
};
