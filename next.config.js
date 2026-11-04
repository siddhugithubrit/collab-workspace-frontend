/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack काढून टाकून Webpack मोड चालू करणे जेणेकरून TipTap प्लगिन्सचा हा एरर कायमचा जाईल
  webpack: (config) => {
    return config
  },
};

module.exports = nextConfig;