import express from "express"
import fileUpload from "express-fileupload"
import path from "path"
import os from "os"
import fs from "fs"
import archiver from "archiver"
import ffmpeg from "fluent-ffmpeg"

// import { initFolders } from "./initFolders.mts"
import { runColmap, ColmapOptions } from "./colmap.mts"

// initFolders()

declare module 'express-serve-static-core' {
  interface Request {
    files: any;
  }
}

const app = express()
const port = 7860

const maxActiveRequests = 4
let activeRequests = 0

app.use(express.json({limit: '50mb'}))
app.use(express.urlencoded({limit: '50mb', extended: true}))
app.use(fileUpload())

app.post("/", async (req, res) => {
  if (activeRequests >= maxActiveRequests) {
    res.status(503).json({message: "Service Unavailable: Max concurrent requests reached. Please try again later"}).end();
    return
  }
  activeRequests++
  
  if (!req.files || !req.files.data || req.files.data.mimetype !== 'video/mp4') {
    res.status(400).json({error: "Missing or invalid data file in request"}).end()
    return
  }

  let options: ColmapOptions = req.body 
  let dataFile: fileUpload.UploadedFile = req.files.data

  let projectTempDir = path.join(os.tmpdir(), Math.random().toString().slice(2))
  let outputTempDir = path.join(os.tmpdir(), Math.random().toString().slice(2))

  try {
    fs.mkdirSync(projectTempDir) 
    fs.mkdirSync(outputTempDir) 

    await dataFile.mv(path.join(projectTempDir, dataFile.name)) 

    let imageFolder = path.join(projectTempDir, 'images');
    fs.mkdirSync(imageFolder)

    await new Promise((resolve, reject) => {
      ffmpeg(path.join(projectTempDir, dataFile.name))
        .outputOptions('-vf', 'fps=1') // Change this value depending on the number of frames you want from video.
        .output(path.join(imageFolder, 'image-%03d.png'))
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    options.projectPath = projectTempDir 
    options.workspacePath = projectTempDir 
    options.imagePath = imageFolder

    const result = await runColmap(options)

    let outputFilePath = path.join(outputTempDir, 'output.zip')
    let output = fs.createWriteStream(outputFilePath)
    let archive = archiver('zip')

    archive.directory(outputTempDir, false)
    archive.pipe(output)
    await archive.finalize()

    res.status(200)
    res.download(outputFilePath, 'output.zip', (error) => {
      if (!error) fs.rmSync(projectTempDir, {recursive: true, force: true}) 
      fs.rmSync(outputTempDir, {recursive: true, force: true})
    })
  } catch (error) {
    res.status(500).json({
      error: "Couldn't generate pose data",
      message: error
    }).end()
  } finally {
    activeRequests--
  }
});

app.get("/", async (req, res) => {
  res.status(200)
  res.write(`<html><head></head><body>
Campose API is a micro-service used to generate came pose data from a set of images.
    </body></html>`)
  res.end()
})

app.listen(port, () => { console.log(`Open http://localhost:${port}`) })