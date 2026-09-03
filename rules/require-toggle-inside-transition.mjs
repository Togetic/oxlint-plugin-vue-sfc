import {
    NODE_ELEMENT,
    PROP_ATTRIBUTE,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/require-toggle-inside-transition` (no native oxlint equivalent — oxc#15761).
 *
 * `<Transition>` animates an element ENTERING or LEAVING. If its content is never toggled,
 * nothing ever enters or leaves, so the transition is inert — the CSS is written, reviewed and
 * shipped, and simply never runs. Usually the toggle was removed, or was put on the
 * `<Transition>` itself instead of on the child.
 *
 * Scope was derived EMPIRICALLY from eslint-plugin-vue rather than from its docs, after a first
 * implementation produced 10 corpus false positives. Probed behaviour, all confirmed against
 * ESLint on the same fixtures:
 * - Only a direct child that is a PLAIN HTML element can trigger the report. Components,
 *   `<slot>`, `<template>`, and text/interpolation children are all exempt — their rendered
 *   content is not statically knowable, so the rule cannot conclude nothing toggles.
 * - Nesting is NOT descended: `<Transition><div><span v-if>` IS reported, because the direct
 *   child `<div>` is what would have to enter or leave.
 * - A toggle on the `<Transition>` ITSELF does not satisfy it (confirmed: ESLint still reports).
 * - `appear` exempts the whole Transition — it animates on initial render, so static content
 *   is legitimate. This alone accounted for 5 of the 10 false positives.
 * - The report is anchored on the CHILD element, not on the `<Transition>` (column parity).
 * - A toggle on any qualifying child satisfies it; not all children need one.
 */

// `<TransitionGroup>` is deliberately OUT of scope. It animates list MEMBERSHIP changes, so
// its children need no toggle at all — confirmed against eslint-plugin-vue, which flags no
// TransitionGroup case, not even one with a fully static child. Including it produced a false
// positive on a real v-for list here.
const TRANSITION_TAGS = new Set(["transition", "Transition"]);
const TOGGLE_DIRECTIVES = new Set(["if", "else-if", "else", "show"]);
/** ElementTypes.ELEMENT — a plain HTML element, as opposed to COMPONENT / SLOT / TEMPLATE. */
const ELEMENT_PLAIN = 0;

/**
 * `appear` makes the Transition animate on INITIAL render, so it has a reason to exist even
 * with static content and no toggle. Verified against eslint-plugin-vue: it reports a plain
 * `<Transition>` but not `<Transition appear>`. Without this exemption the rule produced 10
 * false positives on this repo, every one of them a legitimate appear-animation.
 */
function hasAppear(node) {
    return (node.props ?? []).some((prop) => {
        if (prop.type === PROP_ATTRIBUTE) {
            return prop.name === "appear";
        }
        return (
            prop.type === PROP_DIRECTIVE &&
            prop.name === "bind" &&
            prop.arg?.type === 4 /* SIMPLE_EXPRESSION */ &&
            prop.arg.content === "appear"
        );
    });
}

function hasToggle(node) {
    for (const prop of node.props ?? []) {
        if (prop.type !== PROP_DIRECTIVE) {
            continue;
        }
        if (TOGGLE_DIRECTIVES.has(prop.name)) {
            return true;
        }
        // Dynamic `<component :is>`: swapping the resolved component is the enter/leave.
        if (
            prop.name === "bind" &&
            prop.arg?.type === 4 /* SIMPLE_EXPRESSION */ &&
            prop.arg.content === "is"
        ) {
            return true;
        }
    }
    return false;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "require control the display of the content inside `<transition>`",
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
                    if (node.type !== NODE_ELEMENT || !TRANSITION_TAGS.has(node.tag)) {
                        return;
                    }
                    if (hasAppear(node)) {
                        return;
                    }
                    // Only plain HTML element children are judgeable; see the header note.
                    const elements = (node.children ?? []).filter(
                        (child) =>
                            child.type === NODE_ELEMENT && child.tagType === ELEMENT_PLAIN,
                    );
                    if (!elements.length) {
                        return;
                    }
                    if (elements.some(hasToggle)) {
                        return;
                    }
                    const child = elements[0];
                    reportAtFileOffset(
                        context,
                        entry,
                        child.loc.start.offset,
                        child.loc.end.offset,
                        `Nothing inside this <${node.tag}> is ever toggled, so the transition never runs. Add \`v-if\` / \`v-show\` to the child (not to the <${node.tag}> itself), or use a dynamic \`<component :is>\`.`,
                    );
                });
            },
        };
    },
};
