import type { Meta, StoryObj } from "@storybook/react";
import { SessionControls } from "./SessionControls";

const meta: Meta<typeof SessionControls> = {
  title: "session/SessionControls",
  component: SessionControls,
  args: {
    mode: "live",
    onStart: () => {},
    onEvaluate: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SessionControls>;

export const Idle: Story = {
  args: {
    mode: "live",
    canStart: true,
    canEvaluate: false,
    evaluationStatus: "idle",
  },
};

export const Connected: Story = {
  args: {
    mode: "live",
    canStart: false,
    canEvaluate: true,
    evaluationStatus: "idle",
  },
};

export const ResultsReady: Story = {
  args: {
    mode: "results",
    canStart: true,
    canEvaluate: true,
    evaluationStatus: "idle",
  },
};

export const ResultsEvaluating: Story = {
  args: {
    mode: "results",
    canStart: true,
    canEvaluate: false,
    evaluationStatus: "loading",
  },
};


