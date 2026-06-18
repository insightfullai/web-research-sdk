import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vocs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  checkDeadlinks: false,
  title: "Insightfull Web Research SDK v1",
  description:
    "Drop-in JavaScript SDK for event-triggered study delivery. Track user behavior, match triggers, and display research studies with full customization.",
  rootDir: ".",
  basePath: "/web-research-sdk",
  iconUrl: "/favicon.svg",
  titleTemplate: "%s \u2013 Insightfull Web Research SDK v1",
  editLink: {
    pattern:
      "https://github.com/insightfullai/web-research-sdk/edit/main/packages/docs/pages/:path",
    text: "Edit this page on GitHub",
  },
  sidebar: [
    { text: "Getting Started", link: "/docs/getting-started" },
    { text: "Triggers", link: "/docs/triggers" },
    { text: "Customization", link: "/docs/customization" },
    {
      text: "API Reference",
      collapsed: false,
      items: [
        { text: "Core SDK", link: "/docs/api/core" },
        { text: "React", link: "/docs/api/react" },
      ],
    },
    {
      text: "Examples",
      collapsed: false,
      items: [
        {
          text: "Custom Modal (Plain JS)",
          link: "/docs/examples/custom-modal-example",
        },
        {
          text: "Full React App",
          link: "/docs/examples/full-react-example",
        },
      ],
    },
  ],
  topNav: [
    {
      text: "Docs",
      link: "/docs/getting-started",
      match: "/docs",
    },
    {
      text: "GitHub",
      link: "https://github.com/insightfullai/web-research-sdk",
    },
  ],
  socials: [
    {
      icon: "github",
      link: "https://github.com/insightfullai/web-research-sdk",
    },
  ],
  theme: {
    accentColor: "#6366f1",
  },
  vite: {
    server: {
      port: 6001,
    },
    resolve: {
      alias: {
        fsevents: path.join(__dirname, "stubs", "fsevents.js"),
        lightningcss: path.join(__dirname, "stubs", "lightningcss.js"),
      },
      dedupe: ["react", "react-dom"],
    },
  },
});
