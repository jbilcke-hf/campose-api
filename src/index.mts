import express, { Request, Response, NextFunction } from "express";
import path from "path";
import os from "os";
import fs from "fs";
import util from "util";
import axios from "axios";
import fileUpload from "express-fileupload";
import archiver from "archiver";
import ffmpeg from "fluent-ffmpeg";
import { ColmapOptions, runColmap } from "./colmap.mts";

const writeFile = util.promisify(fs.writeFile);

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

  const { projectTempDir, outputTempDir, imageFolder } = setupDirectories();

  const defaultOptions: ColmapOptions = {
    command: 'automatic_reconstructor',
    workspacePath: projectTempDir + '/images',
    imagePath: projectTempDir + '/images',
  };

  const requestBody = typeof req.body === "object" ? req.body : undefined;
  const options: ColmapOptions = {...defaultOptions, ...requestBody};

  console.log("options:", options);

  let dataFile: fileUpload.UploadedFile | Buffer = Buffer.from("");

  try {
    // we accept either JSON requests
    if (req.is("json")) {
      const { data } = await axios.get(req.body.assetUrl, {
        responseType: "arraybuffer",
      });
      dataFile = Buffer.from(data, "binary");
    }
    // or file uploads
    else {
      if (!req.files || !req.files.data || req.files.data.mimetype !== 'video/mp4') {
        return res.status(400).send("Missing or invalid data file in request");
      }
      dataFile = req.files.data;
    }

    const filePath = await handleFileStorage(dataFile, projectTempDir);

    await generateImagesFromData(imageFolder, filePath);

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

async function handleFileStorage(dataFile: fileUpload.UploadedFile | Buffer, projectTempDir: string) {
  console.log(`handleFileStorage called (projectTempDir: ${projectTempDir})`);
  console.log("typeof dataFile: " + typeof dataFile);
  if (dataFile instanceof Buffer) {
    console.log("dataFile is a Buffer!");
    const filePath = path.join(projectTempDir, "data.mp4");
    await writeFile(filePath, dataFile);
    return filePath;
  } else if (typeof dataFile === "object" && dataFile.mv) {
    console.log(`typeof dataFile === "object" && dataFile.mv`);
    try {
      console.log("dataFile.name = " + dataFile.name);
      const filePath = path.join(projectTempDir, dataFile.name)
      console.log("path.join(projectTempDir, dataFile.name) = " + filePath);
      await dataFile.mv(filePath);
      return filePath;
    } catch (error) {
      throw new Error(`File can't be moved: ${error}`);
    }
  } else {
    console.log(`unrecognized dataFile format`);
    throw new Error("Invalid File");
  }

}

function generateImagesFromData(imageFolder: string, filePath: string) {
  console.log(`generateImagesFromData("${imageFolder}", "${filePath}")`);
  return new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      // .outputOptions('-vf', 'fps=1')
      .outputOptions('-i')
      .output(path.join(imageFolder, 'image-%03d.png'))
      .on('end', () => {
        console.log('Image generation finished successfully.');
        resolve();
      })
      .on('error', (err) => {
        console.log(`failed to generate the images: ${err}`)
        reject(err);
      })
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