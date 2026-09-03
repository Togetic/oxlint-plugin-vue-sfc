import {
    NODE_ELEMENT,
    NODE_TEXT,
    findDirective,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-child-content` (no native oxlint equivalent — oxc#15761).
 *
 * `v-text` and `v-html` REPLACE an element's children. So markup written inside such an
 * element never renders — it reads as live content but is dead. Typically a leftover from
 * converting static markup to a binding, or a merge that kept both.
 *
 * Judging "has children" carefully, because the naive check reports on formatting:
 * - Whitespace-only text children are ignored; `<p v-text="x">\n</p>` is just indentation.
 * - A comment child is ignored: it renders nothing, so `v-text` overwrites nothing.
 * - Anything else — real text, an element, an interpolation — is content that will be
 *   silently discarded, and is reported.
 */

function meaningfulChildren(node) {
    return (node.children ?? []).filter((child) => {
        if (child.type === NODE_TEXT) {
            return (child.content ?? "").trim() !== "";
        }
        // NodeTypes.COMMENT === 3; renders nothing, so it is not lost content.
        return child.type !== 3;
    });
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow element's child contents which would be overwritten by a directive like `v-html` or `v-text`",
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
                    const directive = findDirective(node, "text") ?? findDirective(node, "html");
                    if (!directive) {
                        return;
                    }
                    const children = meaningfulChildren(node);
                    if (!children.length) {
                        return;
                    }
                    const first = children[0];
                    const last = children[children.length - 1];
                    reportAtFileOffset(
                        context,
                        entry,
                        first.loc.start.offset,
                        last.loc.end.offset,
                        `This content is never rendered: \`v-${directive.name}\` on <${node.tag}> replaces the element's children. Remove the content, or remove the directive.`,
                    );
                });
            },
        };
    },
};
