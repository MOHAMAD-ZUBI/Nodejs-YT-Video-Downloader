const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const downloadStream = (url, options, outputPath) => {
  return new Promise((resolve, reject) => {
    const stream = ytdl(url, options);
    const file = fs.createWriteStream(outputPath);
    stream.pipe(file);
    file.on("finish", () => resolve());
    file.on("error", (err) => reject(err));
    stream.on("error", (err) => reject(err));
  });
};

const checkFile = (filePath, description) => {
  if (!fs.existsSync(filePath)) {
    console.error(`${description} file does not exist: ${filePath}`);
    return false;
  }
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    console.error(`${description} file is empty: ${filePath}`);
    return false;
  }
  console.log(`${description} file size: ${stats.size} bytes`);
  return true;
};

const videoDownload = async (req, res) => {
  try {
    const videoURL = req.query.url;
    if (!ytdl.validateURL(videoURL)) {
      return res.status(400).json({ message: "Invalid YouTube URL" });
    }

    // Fetch video information
    const info = await ytdl.getInfo(videoURL);
    const duration = parseInt(info.videoDetails.lengthSeconds, 10);
    const maxDuration = 600; // Set maximum duration in seconds (e.g., 10 minutes)

    if (duration > maxDuration) {
      return res.status(400).json({ message: "Video is too long" });
    }

    let title = info.videoDetails.title;
    // Sanitize title to remove invalid characters
    title = title.replace(/[^a-zA-Z0-9 \-_]/g, "");
    if (title.length === 0) {
      title = "video"; // Fallback title
    }
    const videoPath = path.resolve(__dirname, "temp_video.mp4");
    const audioPath = path.resolve(__dirname, "temp_audio.mp4");
    const outputPath = path.resolve(__dirname, `${title}.mp4`);

    console.log("Starting download of video and audio streams...");

    await Promise.all([
      downloadStream(videoURL, { quality: "highestvideo" }, videoPath),
      downloadStream(videoURL, { quality: "highestaudio" }, audioPath),
    ]);

    console.log("Download complete, starting merge process...");

    if (!checkFile(videoPath, "Video") || !checkFile(audioPath, "Audio")) {
      return res.status(500).json({ error: "Error with downloaded files" });
    }

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions("-c:v copy")
      .outputOptions("-c:a aac")
      .save(outputPath)
      .on("end", () => {
        console.log("Merge complete, cleaning up files...");
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
            res.status(500).json({ error: err.message });
          } else {
            fs.unlinkSync(outputPath); // Clean up merged file after sending
            console.log("Video downloaded successfully");
          }
        });
      })
      .on("error", (err) => {
        console.error("Error during merging:", err);
        res.status(500).json({ error: err.message });
      });
  } catch (error) {
    console.error("Error processing download:", error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  videoDownload,
};
