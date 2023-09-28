import express, { Request, Response, NextFunction } from "express";
import path from "path";
import os from "os";
import fs from "fs";
import axios from "axios";
import fileUpload from "express-fileupload";
import archiver from "archiver";
import ffmpeg from "fluent-ffmpeg";
import { ColmapOptions, runColmap } from "./colmap.mts";

declare module 'express-serve-static-core' {
  interface Request {
    files: any;
  }
}

const app = express();
const port = 7860;

const maxActiveRequests = 4;
let activeRequests = 0;

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));
app.use(fileUpload());

app.post("/", async (req: Request, res: Response, _next: NextFunction) => {
  if (activeRequests++ >= maxActiveRequests) {
    return res.status(503).send("Service Unavailable");
  }

  const options: ColmapOptions = req.body;
  let dataFile: fileUpload.UploadedFile | string = "";

  try {
    if (req.is("json")) {
      const { data } = await axios.get(req.body.assetUrl, {
        responseType: "arraybuffer",
      });
      dataFile = Buffer.from(data, "binary");
    }
    // Request is not JSON type is file upload request
    else {
      if (!req.files || !req.files.data || req.files.data.mimetype !== 'video/mp4') {
        return res.status(400).send("Missing or invalid data file in request");
      }
      dataFile = req.files.data;
    }

    const { projectTempDir, outputTempDir, imageFolder } = setupDirectories();
    await handleFileStorage(dataFile, projectTempDir);

    await generateImagesFromData(projectTempDir, imageFolder);

    options.projectPath = projectTempDir;
    options.workspacePath = projectTempDir;
    options.imagePath = imageFolder;

    // note: we don't need to read the result since this is a function having side effects on the file system
    const result = await runColmap(options);
    console.log("result:", result);

    await createOutputArchive(outputTempDir);

    res.download(path.join(outputTempDir, 'output.zip'), 'output.zip', (error) => {
      if (!error) fs.rmSync(projectTempDir, {recursive: true, force: true});
      fs.rmSync(outputTempDir, {recursive: true, force: true});
    });
  } catch (error) {
    res.status(500).send(`Couldn't generate pose data. Error: ${error}`);
  } finally {
    activeRequests--;
  }
});

app.get("/", async (req: Request, res: Response) => {
  res.send("Campose API is a micro-service used to generate camera pose data from a set of images.");
});

app.listen(port, () => console.log(`Listening at http://localhost:${port}`));

function setupDirectories() {
  const projectTempDir = path.join(os.tmpdir(), Math.random().toString().slice(2));
  const outputTempDir = path.join(os.tmpdir(), Math.random().toString().slice(2));
  const imageFolder = path.join(projectTempDir, 'images');

  fs.mkdirSync(projectTempDir);
  fs.mkdirSync(outputTempDir);
  fs.mkdirSync(imageFolder);

  return { projectTempDir, outputTempDir, imageFolder };
}

async function handleFileStorage(dataFile: fileUpload.UploadedFile | string, projectTempDir: string) {
  if (typeof dataFile === "string") {
    fs.writeFile(path.join(projectTempDir, "data.mp4"), dataFile, (err) => {
      if (err) throw err;
    });
  } else {
    await dataFile.mv(path.join(projectTempDir, dataFile.name));
  }
}

function generateImagesFromData(projectTempDir: string, imageFolder: string) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(path.join(projectTempDir, 'data.mp4'))
      .outputOptions('-vf', 'fps=1')
      .output(path.join(imageFolder, 'image-%03d.png'))
      .on('end', resolve)
      .on('error', reject)
      .run()
  });
}

function createOutputArchive(outputTempDir: string) {
  return new Promise<void>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(path.join(outputTempDir, 'output.zip'));

    archive.pipe(output);
    archive.directory(path.join(outputTempDir, '/'), '');
    archive.finalize();
    resolve();
  });
}