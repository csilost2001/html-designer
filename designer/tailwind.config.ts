import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/styles/themes/theme-tailwind.css",
    // theme-tailwind.css 内の @apply で使う class を全 scan
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
