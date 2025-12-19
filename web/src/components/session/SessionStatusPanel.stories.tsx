import type { Meta, StoryObj } from "@storybook/react";
import { SessionStatusPanel } from "./SessionStatusPanel";

const meta: Meta<typeof SessionStatusPanel> = {
  title: "session/SessionStatusPanel",
  component: SessionStatusPanel,
};

export default meta;
type Story = StoryObj<typeof SessionStatusPanel>;

export const Idle: Story = {
  args: {
    state: "idle",
    phase: "none",
    secondsLeft: 300,
    prepSecondsLeft: 60,
    showOcr: true,
    ocrStatus: "idle",
  },
};

export const Prep: Story = {
  args: {
    state: "connected",
    phase: "prep",
    secondsLeft: 300,
    prepSecondsLeft: 42,
    showOcr: true,
    ocrStatus: "ready",
  },
};

export const Exam: Story = {
  args: {
    state: "connected",
    phase: "exam",
    secondsLeft: 127,
    prepSecondsLeft: 0,
    showOcr: false,
  },
};

export const Error: Story = {
  args: {
    state: "error",
    phase: "none",
    secondsLeft: 300,
    prepSecondsLeft: 60,
    showOcr: true,
    ocrStatus: "error",
  },
};


