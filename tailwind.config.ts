import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  safelist: [
    // Cores dinâmicas das colunas do Kanban (geradas via bg-${cor} / ring-${cor}/30 / text-${cor})
    { pattern: /^(bg|ring|text)-(kanban-(new|budget|sent|negotiation|closed)|destructive|muted-foreground)(\/(10|20|30|40|50))?$/ },
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        kanban: {
          new: "hsl(var(--kanban-new))",
          budget: "hsl(var(--kanban-budget))",
          sent: "hsl(var(--kanban-sent))",
          negotiation: "hsl(var(--kanban-negotiation))",
          closed: "hsl(var(--kanban-closed))",
        },
        // Landing page — constantes de marca, fora do sistema claro/escuro do app.
        lp: {
          ink: "hsl(var(--lp-ink))",
          "ink-elevado": "hsl(var(--lp-ink-elevado))",
          cream: "hsl(var(--lp-cream))",
        },
      },
      // As fontes já são carregadas no index.html e aplicadas por seletor em
      // body/h1-h4; mapeá-las aqui é o que permite usar font-display num <div>
      // ou <span> da landing. Nenhuma classe font-sans/font-display existia no
      // projeto antes disto, então não há regressão de tipografia.
      fontFamily: {
        sans: ["Satoshi", "system-ui", "-apple-system", "sans-serif"],
        display: ["General Sans", "Satoshi", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        // Landing page
        "lp-surgir": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "lp-card-entra": {
          from: { opacity: "0", transform: "translateY(-8px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "lp-pulsar": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "lp-surgir": "lp-surgir 0.6s ease-out both",
        "lp-card-entra": "lp-card-entra 0.35s ease-out both",
        "lp-pulsar": "lp-pulsar 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
