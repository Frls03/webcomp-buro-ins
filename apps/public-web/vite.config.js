import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/inscripcion/",
  plugins: [react()],
  server: {
    port: 5173
  }
});
