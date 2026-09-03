import {
    ELEMENT_COMPONENT,
    NODE_ELEMENT,
    findDirective,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/no-v-text-v-html-on-component` (no native oxlint equivalent — oxc#15761).
 *
 * `v-text` / `v-html` set the host element's textContent/innerHTML. On a COMPONENT that means
 * Vue passes the value as the default slot and the component's own rendered output is thrown
 * away — or, worse, the component renders normally and the directive appears to do nothing.
 * Either way the intent (put this text inside the component) is not what happens; a prop or an
 * explicit slot is.
 *
 * `v-html` on a component carries the additional XSS surface of `v-html` generally, with the
 * component boundary making it easier to miss in review — hence keeping this rule rather than
 * treating it as style.
 *
 * Component detection uses the parser's own `tagType` (`ElementTypes.COMPONENT`), not a
 * casing heuristic: `@vue/compiler-sfc` already resolves `<MyThing>`, `<my-thing>` and
 * `<component>` correctly, and re-deriving it from the tag name would misjudge kebab-case
 * components and custom elements.
 */

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow `v-text` / `v-html` on component",
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
                    if (node.type !== NODE_ELEMENT || node.tagType !== ELEMENT_COMPONENT) {
                        return;
                    }
                    const directive = findDirective(node, "text") ?? findDirective(node, "html");
                    if (!directive) {
                        return;
                    }
                    reportAtFileOffset(
                        context,
                        entry,
                        directive.loc.start.offset,
                        directive.loc.end.offset,
                        `\`v-${directive.name}\` on the component <${node.tag}> discards its own rendered output instead of putting content inside it. Pass a prop or use an explicit slot.`,
                    );
                });
            },
        };
    },
};
