import {
    NODE_ELEMENT,
    PROP_ATTRIBUTE,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/require-component-is` (no native oxlint equivalent — oxc#15761).
 *
 * `<component>` renders whatever `is` names. Without `is` it renders nothing at all —
 * silently, with no warning — so the subtree just disappears. Almost always a rename or
 * a bad merge that dropped the binding.
 *
 * What counts as satisfying the rule:
 * - `:is` / `v-bind:is` — the normal dynamic form.
 * - a static `is="MyComponent"` — unusual but valid and does render, so not flagged.
 * - `v-bind="obj"` (argument-less spread) — `is` may well come from the object. We cannot
 *   see inside it, so we treat a spread as satisfying the rule rather than emit a report
 *   we cannot substantiate; a false positive here would be on working code.
 */

function hasIs(node) {
    for (const prop of node.props ?? []) {
        if (prop.type === PROP_ATTRIBUTE && prop.name === "is") {
            return true;
        }
        if (prop.type === PROP_DIRECTIVE && prop.name === "bind") {
            // Argument-less `v-bind="obj"` spread: `is` might be in there.
            if (!prop.arg) {
                return true;
            }
            if (prop.arg.type === 4 /* SIMPLE_EXPRESSION */ && prop.arg.content === "is") {
                return true;
            }
        }
    }
    return false;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "require `v-bind:is` of `<component>` elements",
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
                    if (node.type !== NODE_ELEMENT || node.tag !== "component") {
                        return;
                    }
                    if (hasIs(node)) {
                        return;
                    }
                    reportAtFileOffset(
                        context,
                        entry,
                        node.loc.start.offset,
                        node.loc.end.offset,
                        "`<component>` without `is` renders nothing, silently. Add `:is` naming the component to render.",
                    );
                });
            },
        };
    },
};
