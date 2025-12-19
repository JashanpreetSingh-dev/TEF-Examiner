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
    mode: "live",
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
    mode: "live",
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
    mode: "live",
    state: "connected",
    phase: "exam",
    secondsLeft: 127,
    prepSecondsLeft: 0,
    showOcr: false,
  },
};

export const ResultsTimeout: Story = {
  args: {
    mode: "results",
    state: "stopped",
    phase: "none",
    secondsLeft: 0,
    prepSecondsLeft: 0,
    endedAtMs: Date.now(),
    endedReason: "timeout",
    showOcr: true,
    ocrStatus: "ready",
  },
};

export const Error: Story = {
  args: {
    mode: "live",
    state: "error",
    phase: "none",
    secondsLeft: 300,
    prepSecondsLeft: 60,
    showOcr: true,
    ocrStatus: "error",
  },
};


