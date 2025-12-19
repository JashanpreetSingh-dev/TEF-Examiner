import type { Preview } from "@storybook/react";

import "../src/app/globals.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Global theme for components",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        items: ["light", "dark"],
      },
    },
  },
  decorators: [
    (Story, context) => {
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        if (context.globals.theme === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
      }
      return Story();
    },
  ],
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;