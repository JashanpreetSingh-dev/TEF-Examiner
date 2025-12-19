import type { Meta, StoryObj } from "@storybook/react";
import { SessionControls } from "./SessionControls";

const meta: Meta<typeof SessionControls> = {
  title: "session/SessionControls",
  component: SessionControls,
  args: {
    onStart: () => {},
    onStop: () => {},
    onEvaluate: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SessionControls>;

export const Idle: Story = {
  args: {
    canStart: true,
    canStop: false,
    canEvaluate: false,
    isEvaluating: false,
  },
};

export const Connected: Story = {
  args: {
    canStart: false,
    canStop: true,
    canEvaluate: false,
    isEvaluating: false,
  },
};

export const StoppedWithEval: Story = {
  args: {
    canStart: true,
    canStop: false,
    canEvaluate: true,
    isEvaluating: false,
  },
};

export const Evaluating: Story = {
  args: {
    canStart: true,
    canStop: false,
    canEvaluate: false,
    isEvaluating: true,
  },
};


