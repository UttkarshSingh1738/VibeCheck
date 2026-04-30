import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        spotify: "#1DB954",
        ink: "#0b0b0f"
      }
    }
  },
  plugins: []
};

export default config;
