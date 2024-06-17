const express = require("express");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

// Set the path to the ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/download", async (req, res) => {
  const videoURL = req.query.url;

  if (!ytdl.validateURL(videoURL)) {
    return res.status(400).send("Invalid YouTube URL");
  }

  try {
    const info = await ytdl.getInfo(videoURL);
    let title = info.videoDetails.title;

    // Sanitize title to remove invalid characters
    title = title.replace(/[^a-zA-Z0-9 \-_]/g, "");

    if (title.length === 0) {
      title = "video"; // Fallback title
    }

    const videoPath = path.join("/tmp", "temp_video.mp4");
    const audioPath = path.join("/tmp", "temp_audio.mp4");
    const outputPath = path.join("/tmp", `${title}.mp4`);

    const videoStream = ytdl(videoURL, { quality: "highestvideo" });
    const audioStream = ytdl(videoURL, { quality: "highestaudio" });

    // Download video
    await new Promise((resolve, reject) => {
      const videoFile = fs.createWriteStream(videoPath);
      videoStream.pipe(videoFile);
      videoFile.on("finish", resolve);
      videoFile.on("error", reject);
    });

    // Download audio
    await new Promise((resolve, reject) => {
      const audioFile = fs.createWriteStream(audioPath);
      audioStream.pipe(audioFile);
      audioFile.on("finish", resolve);
      audioFile.on("error", reject);
    });

    // Merge video and audio
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions("-c:v copy")
      .outputOptions("-c:a copy")
      .save(outputPath)
      .on("end", () => {
        // Clean up temporary files
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);

        // Serve the merged file
        res.header(
          "Content-Disposition",
          `attachment; filename="${title}.mp4"`
        );
        res.header("Content-Type", "video/mp4");
        res.sendFile(outputPath, (err) => {
          if (err) {
            console.error("Error sending file:", err);
            res.status(500).send("Error sending file");
          } else {
            fs.unlinkSync(outputPath); // Clean up merged file after sending
            console.log("Video downloaded successfully");
          }
        });
      })
      .on("error", (err) => {
        console.error("Error during merging:", err);
        res.status(500).send("Error merging video and audio");
      });
  } catch (err) {
    console.error("Error fetching video info:", err);
    res.status(500).send("Error fetching video info");
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
