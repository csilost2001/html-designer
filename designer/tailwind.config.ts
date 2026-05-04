import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/styles/themes/theme-tailwind.css",
    // theme-tailwind.css 内の @apply で使う class を全 scan
    // sample HTML 内 (design.json の components 文字列) に直書きされた Tailwind
    // utility class も canvas iframe で効くよう JIT scan 対象に含める (#793 子 7 で発見)。
    // glob は ../examples/ 配下の任意の階層の *.design.json を再帰スキャンするため、
    // screens/*.design.json は包含済 (重複追加しない)
    "../examples/**/*.design.json",
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
