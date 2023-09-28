---
title: Campose API
emoji: 📷
colorFrom: green
colorTo: yellow
sdk: docker
pinned: true
app_port: 7860
---

## Presentation

### What is this project?

WARNING - This project is not finished!

Campose API is a REST API to generate camera pose data from a set of images or a video.

## Manual testing (using CURL)

Generating poses from a local video:

```bash:
curl -X POST -H "Content-Type: multipart/form-data" -F "data=@video.mp4" http://localhost:7860/
```

Generating poses from a remote video:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"assetUrl":"http://example.com/video.mp4"}' http://localhost:7860/
```

## Running on your machine

### Prerequisites

You need a machine with CUDA, a GPU etc

### Environment variables

- `STORAGE_PATH`: on HF use `/data`, on a local you can use `.sandbox/`

### Deployment to Hugging Face
