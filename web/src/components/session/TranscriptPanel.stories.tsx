import type { Meta, StoryObj } from "@storybook/react";
import { TranscriptPanel } from "./TranscriptPanel";

const meta: Meta<typeof TranscriptPanel> = {
  title: "session/TranscriptPanel",
  component: TranscriptPanel,
};

export default meta;
type Story = StoryObj<typeof TranscriptPanel>;

export const EmptyClosed: Story = {
  args: {
    transcript: [],
    open: false,
  },
};

export const FilledOpen: Story = {
  args: {
    transcript: [
      { id: "1", role: "system", text: "Début de l’épreuve." },
      { id: "2", role: "assistant", text: "Bonjour, je vous écoute." },
      { id: "3", role: "user", text: "Bonjour, je voudrais des informations sur les tarifs." },
      { id: "4", role: "assistant", text: "Bien sûr. Les tarifs commencent à 25€ par personne." },
    ],
    open: true,
  },
};


