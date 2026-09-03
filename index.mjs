import noChildContentRule from "./rules/no-child-content.mjs";
import noDupeVElseIfRule from "./rules/no-dupe-v-else-if.mjs";
import noDuplicateAttributesRule from "./rules/no-duplicate-attributes.mjs";
import noLoneTemplateRule from "./rules/no-lone-template.mjs";
import noMutatingPropsRule from "./rules/no-mutating-props.mjs";
import noParsingErrorRule from "./rules/no-parsing-error.mjs";
import noRawTextRule from "./rules/no-raw-text.mjs";
import noRefAsOperandRule from "./rules/no-ref-as-operand.mjs";
import noTemplateKeyRule from "./rules/no-template-key.mjs";
import noTemplateShadowRule from "./rules/no-template-shadow.mjs";
import noTextareaMustacheRule from "./rules/no-textarea-mustache.mjs";
import noUnusedComponentsRule from "./rules/no-unused-components.mjs";
import noUnusedVarsRule from "./rules/no-unused-vars.mjs";
import noUseVIfWithVForRule from "./rules/no-use-v-if-with-v-for.mjs";
import noUselessTemplateAttributesRule from "./rules/no-useless-template-attributes.mjs";
import noVTextVHtmlOnComponentRule from "./rules/no-v-text-v-html-on-component.mjs";
import requireComponentIsRule from "./rules/require-component-is.mjs";
import requireExplicitEmitsRule from "./rules/require-explicit-emits.mjs";
import requireToggleInsideTransitionRule from "./rules/require-toggle-inside-transition.mjs";
import requireVForKeyRule from "./rules/require-v-for-key.mjs";
import requireValidDefaultPropRule from "./rules/require-valid-default-prop.mjs";
import thisInTemplateRule from "./rules/this-in-template.mjs";
import useVOnExactRule from "./rules/use-v-on-exact.mjs";
import vOnEventHyphenationRule from "./rules/v-on-event-hyphenation.mjs";

const plugin = {
    meta: { name: "vue-sfc" },
    rules: {
        "no-child-content": noChildContentRule,
        "no-dupe-v-else-if": noDupeVElseIfRule,
        "no-duplicate-attributes": noDuplicateAttributesRule,
        "no-lone-template": noLoneTemplateRule,
        "no-mutating-props": noMutatingPropsRule,
        "no-parsing-error": noParsingErrorRule,
        "no-raw-text": noRawTextRule,
        "no-ref-as-operand": noRefAsOperandRule,
        "no-template-key": noTemplateKeyRule,
        "no-template-shadow": noTemplateShadowRule,
        "no-textarea-mustache": noTextareaMustacheRule,
        "no-unused-components": noUnusedComponentsRule,
        "no-unused-vars": noUnusedVarsRule,
        "no-use-v-if-with-v-for": noUseVIfWithVForRule,
        "no-useless-template-attributes": noUselessTemplateAttributesRule,
        "no-v-text-v-html-on-component": noVTextVHtmlOnComponentRule,
        "require-component-is": requireComponentIsRule,
        "require-explicit-emits": requireExplicitEmitsRule,
        "require-toggle-inside-transition": requireToggleInsideTransitionRule,
        "require-v-for-key": requireVForKeyRule,
        "require-valid-default-prop": requireValidDefaultPropRule,
        "this-in-template": thisInTemplateRule,
        "use-v-on-exact": useVOnExactRule,
        "v-on-event-hyphenation": vOnEventHyphenationRule,
    },
};

export default plugin;
