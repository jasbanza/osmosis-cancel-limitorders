const fs = require("fs");
const path = require("path");

const docs = path.join(__dirname, "..", "docs");
fs.mkdirSync(path.join(docs, "styles"), { recursive: true });

fs.copyFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  path.join(docs, "index.html")
);
fs.copyFileSync(
  path.join(__dirname, "..", "src", "styles", "style.css"),
  path.join(docs, "styles", "style.css")
);

console.log("Copied index.html and style.css to docs/");
