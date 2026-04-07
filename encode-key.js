const fs = require("fs");

// put your NEW private key in a file called private_key.pem
const key = fs.readFileSync("private_key.pem", "utf8");

console.log(Buffer.from(key, "utf8").toString("base64"));