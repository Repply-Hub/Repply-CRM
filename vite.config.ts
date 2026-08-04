import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "log-supabase-url",
      configResolved(config) {
        const url = config.env.VITE_SUPABASE_URL ?? "(não definida)";
        console.log(`\x1b[36m[supabase]\x1b[0m VITE_SUPABASE_URL = ${url}`);
      },
    },
  ].filter(Boolean),
  // Identifica o build nos erros gravados em `app_erros`. Sem isto não dá para
  // separar "erro da versão velha que o usuário ainda tinha em cache" de "erro
  // da versão que acabou de subir" — distinção que importa aqui, porque chunk
  // velho depois de deploy é uma das causas que estamos tratando.
  // A Vercel expõe o commit em VERCEL_GIT_COMMIT_SHA; fora dela vira "local".
  define: {
    __BUILD_ID__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 8),
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
