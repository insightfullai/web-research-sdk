import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vocs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  title: "Insightfull Web Research SDK",
  description:
    "Host-side SDK for live website research sessions with automatic behavioral capture and secure overlay bridge integration.",
  rootDir: ".",
  basePath: "/web-research-sdk",
  iconUrl: "/favicon.svg",
  titleTemplate: "%s \u2013 Insightfull Web Research SDK",
  editLink: {
    pattern:
      "https://github.com/insightfullai/web-research-sdk/edit/main/packages/docs/pages/:path",
    text: "Edit this page on GitHub",
  },
  sidebar: [
    {
      text: "Getting Started",
      link: "/docs/getting-started",
    },
    {
      text: "Customization",
      link: "/docs/customization",
    },
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
    configFile: false,
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
