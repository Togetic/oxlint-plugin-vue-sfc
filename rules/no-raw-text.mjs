import { NODE_ELEMENT, NODE_TEXT, parseSfc, reportAtFileOffset } from "../utils/vue-sfc.mjs";

/**
 * Replacement for `@intlify/vue-i18n/no-raw-text` (no native oxlint equivalent —
 * oxlint has no i18n plugin). Flags user-facing literal text in the template that
 * is not wrapped in an i18n call, so untranslated strings are caught in review
 * instead of shipping. This repo collects missing keys for translators, so raw
 * text in a template is almost always an oversight.
 *
 * Scope & false-positive guards (template-first repo, so the squiggle lands on the
 * script block — the real template line:column is prepended to the message by
 * reportAtFileOffset):
 * - TEXT nodes only. Interpolations (`{{ $t('…') }}`) are never flagged; static
 *   attributes (placeholder/title/…) are out of scope for now.
 * - A text node is flagged only when it contains a 2+ letter word AND at least one
 *   lowercase letter. That skips currency tickers / acronyms (BTC, USDT, OK), pure
 *   numbers, symbols and punctuation — the dominant non-translatable noise — while
 *   still catching real prose ("Buy", "items", "Confirm").
 * - `ignoreTags` skips text inside non-translatable elements (style/script/pre/code).
 * - `ignorePattern` (regex source) lets a project allowlist brand names etc.
 */

const DEFAULT_IGNORE_TAGS = ["style", "script", "pre", "code"];
const HAS_WORD = /\p{L}{2,}/u;
const HAS_LOWER = /\p{Ll}/u;

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow untranslated raw text in Vue templates (use i18n)",
            recommended: false,
        },
        schema: [
            {
                type: "object",
                properties: {
                    ignorePattern: { type: "string" },
                    ignoreTags: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
            },
        ],
        messages: { m: "" },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        const opts = context.options?.[0] ?? {};
        const ignoreTags = new Set(opts.ignoreTags ?? DEFAULT_IGNORE_TAGS);
        const ignoreRe = opts.ignorePattern ? new RegExp(opts.ignorePattern, "u") : null;
        return {
            Program() {
                const entry = parseSfc(context.filename);
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                const visit = (node) => {
                    if (!node) {
                        return;
                    }
                    // Skip the entire subtree of a non-translatable element, not just its
                    // direct text children — text can be nested (`<pre><span>x</span></pre>`).
                    if (node.type === NODE_ELEMENT && ignoreTags.has(node.tag)) {
                        return;
                    }
                    if (node.type === NODE_TEXT) {
                        const text = (node.content ?? "").trim();
                        const flag =
                            text &&
                            HAS_WORD.test(text) &&
                            HAS_LOWER.test(text) &&
                            !(ignoreRe && ignoreRe.test(text));
                        if (flag) {
                            const snippet = text.length > 40 ? `${text.slice(0, 39)}…` : text;
                            reportAtFileOffset(
                                context,
                                entry,
                                node.loc.start.offset,
                                node.loc.end.offset,
                                `Raw template text "${snippet}" should be wrapped in an i18n translation ($t).`,
                            );
                        }
                        return;
                    }
                    for (const child of node.children ?? []) {
                        visit(child);
                    }
                    for (const branch of node.branches ?? []) {
                        visit(branch);
                    }
                };
                visit(ast);
            },
        };
    },
};
