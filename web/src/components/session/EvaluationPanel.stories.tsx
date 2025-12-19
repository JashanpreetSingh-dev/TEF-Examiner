import type { Meta, StoryObj } from "@storybook/react";
import { EvaluationPanel } from "./EvaluationPanel";

const meta: Meta<typeof EvaluationPanel> = {
  title: "session/EvaluationPanel",
  component: EvaluationPanel,
};

export default meta;
type Story = StoryObj<typeof EvaluationPanel>;

export const SchemaObjectCriteria: Story = {
  args: {
    evaluation: {
      model: "gpt-4o-mini",
      result: {
        overall_band_estimate: 6,
        overall_comment:
          "Le candidat a démontré une certaine compétence en interaction, mais la clarté et la fluidité restent perfectibles.",
        criteria: {
          task_fulfillment: 7,
          coherence_organization: 5,
          lexical_range_appropriateness: 6,
          grammar_control: 5,
          fluency_pronunciation: 5,
          interaction: 7,
        },
        strengths: "Questions pertinentes et engagement dans la conversation.",
        top_improvements: "Améliorer la clarté, réduire les hésitations, renforcer la grammaire.",
        upgraded_sentences: [
          "Bonjour, j'ai vu votre annonce et j'aimerais poser quelques questions.",
          "Pourriez-vous me donner l'adresse et les horaires ?",
        ],
      },
    },
  },
};

export const SchemaArrayCriteria: Story = {
  args: {
    evaluation: {
      model: "gpt-4o-mini",
      result: {
        overall_band_estimate: "B2",
        overall_comment: "Bonne interaction, quelques erreurs persistantes.",
        criteria: [
          {
            name: "Coherence & organization",
            score_0_10: 7,
            comment: "Structure claire.",
            improvements: ["Utiliser plus de connecteurs logiques."],
          },
        ],
        strengths: ["Bon rythme", "Lexique adapté"],
        top_improvements: ["Travailler l'accord des temps", "Réduire les répétitions"],
        upgraded_sentences: [
          { weak: "C'est bien.", better: "C'est une excellente idée, surtout parce que…", why: "Plus nuancé et argumenté." },
        ],
      },
    },
  },
};


