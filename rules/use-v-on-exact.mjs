import {
    NODE_ELEMENT,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/use-v-on-exact` (no native oxlint equivalent — oxc#15761).
 *
 * `@click="save"` fires on a plain click AND on ctrl-click, because without `.exact` a handler
 * ignores extra system modifiers. So pairing it with `@click.ctrl="saveAs"` means ctrl-click runs
 * BOTH handlers — you get a save and a save-as from one gesture. The bare handler needs `.exact`
 * to opt out.
 *
 * Semantics derived empirically from eslint-plugin-vue (confirmed case by case):
 * - Only "system" modifiers create the conflict: `ctrl`, `shift`, `alt`, `meta`. Others
 *   (`prevent`, `stop`, `once`, key names like `enter`, mouse buttons) do not, so
 *   `@click` + `@click.prevent` is NOT reported.
 * - The report lands on the handler that has NO system modifiers and no `.exact` — the one that
 *   needs changing — not on the modified sibling.
 * - Two handlers that BOTH carry system modifiers (`@click.ctrl` + `@click.shift`) are fine:
 *   neither swallows the other.
 * - `@click.ctrl.exact` still triggers a report on a bare `@click` sibling: `.exact` on the
 *   modified handler does not rescue the unmodified one.
 * - Grouping is per element and per STATIC event name; a dynamic `@[evt]` is skipped since its
 *   name is not knowable.
 */

const SYSTEM_MODIFIERS = new Set(["ctrl", "shift", "alt", "meta"]);

function modifierNames(prop) {
    return (prop.modifiers ?? []).map((modifier) =>
        typeof modifier === "string" ? modifier : (modifier?.content ?? ""),
    );
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "enforce usage of `exact` modifier on `v-on`",
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
                    /** event name -> handlers on this element */
                    const byEvent = new Map();
                    for (const prop of node.props ?? []) {
                        if (prop.type !== PROP_DIRECTIVE || prop.name !== "on") {
                            continue;
                        }
                        const arg = prop.arg;
                        if (
                            !arg ||
                            arg.type !== 4 /* SIMPLE_EXPRESSION */ ||
                            arg.isStatic === false
                        ) {
                            continue;
                        }
                        const modifiers = modifierNames(prop);
                        const handler = {
                            prop,
                            hasSystem: modifiers.some((m) => SYSTEM_MODIFIERS.has(m)),
                            isExact: modifiers.includes("exact"),
                        };
                        const bucket = byEvent.get(arg.content);
                        if (bucket) {
                            bucket.push(handler);
                        } else {
                            byEvent.set(arg.content, [handler]);
                        }
                    }
                    for (const [event, handlers] of byEvent) {
                        if (handlers.length < 2 || !handlers.some((h) => h.hasSystem)) {
                            continue;
                        }
                        for (const handler of handlers) {
                            if (handler.hasSystem || handler.isExact) {
                                continue;
                            }
                            reportAtFileOffset(
                                context,
                                entry,
                                handler.prop.loc.start.offset,
                                handler.prop.loc.end.offset,
                                `This \`@${event}\` also fires when the modifier keys of its sibling handlers are held, so one gesture runs both. Add \`.exact\` to restrict it to ${event} with no modifiers.`,
                            );
                        }
                    }
                });
            },
        };
    },
};
