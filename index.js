const express = require("express");
const app = express();
const { videoDownload } = require("./utils/script");

app.get("/download", videoDownload);
app.listen(8000, () => {
  console.log("Server is running on port 8000");
});
