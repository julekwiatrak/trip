import sharp from "sharp";

const source = new URL("../public/app-icon.svg", import.meta.url);
const outputs = [
  [180, "apple-touch-icon.png"],
  [192, "pwa-192x192.png"],
  [512, "pwa-512x512.png"],
  [512, "pwa-maskable-512x512.png"],
];

await Promise.all(outputs.map(([size, name]) =>
  sharp(source.pathname).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname),
));
