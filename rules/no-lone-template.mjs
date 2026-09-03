import {
    NODE_ELEMENT,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-lone-template` (no native oxlint equivalent — oxc#15761).
 *
 * `<template>` renders nothing itself; it exists to carry `v-if` / `v-for` / `v-slot` for a
 * group of children. Without one of those it is a no-op wrapper — harmless at runtime, but
 * it misleads the reader into thinking something is conditional or slotted, and it is usually
 * the residue of deleting the directive that justified it.
 *
 * "Has a directive" is the test, not "has attributes": a static attribute on `<template>` is
 * itself useless (that is vue-no-useless-template-attributes' job), so it does not rescue a
 * lone template. Any directive counts — `v-if`, `v-for`, `v-slot`/`#name`, and also less
 * common ones like `v-pre` — because each gives the element a reason to exist.
 *
 * The SFC's own `<template>` block is never flagged: `descriptor.template.ast` is a ROOT node
 * (type 0), not an element, so the walk never sees it as a `<template>` element.
 */

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow unnecessary `<template>`",
            recommended: false,
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
                    const hasDirective = (node.props ?? []).some(
                        (prop) => prop.type === PROP_DIRECTIVE,
                    );
                    if (hasDirective) {
                        return;
                    }
                    reportAtFileOffset(
                        context,
                        entry,
                        node.loc.start.offset,
                        node.loc.end.offset,
                        "`<template>` with no `v-if` / `v-for` / `v-slot` renders nothing and groups nothing. Remove the wrapper, or add the directive it was meant to carry.",
                    );
                });
            },
        };
    },
};
