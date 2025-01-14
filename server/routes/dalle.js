import express from "express";
import * as dotenv from "dotenv";
import fetch from "node-fetch";
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';


dotenv.config();

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Function to generate a consistent seed
function generateSeed(input) {
    const hash = createHash('sha256').update(input).digest('hex');
    const seed = parseInt(hash.substring(0, 10), 16) % 100000;
    return seed;
}


// Function to resize image
async function resizeImage(imagePath, maxWidth = 1024, maxHeight = 1024) {
    try {
        const resizedImageBuffer = await sharp(imagePath)
            .resize({
                width: maxWidth,
                height: maxHeight,
                fit: 'inside',
                withoutEnlargement: true
            }).toBuffer();
        return resizedImageBuffer.toString('base64');

    } catch (error) {
        console.error("Error resizing image:", error);
        throw error; // Propagate the error
    }
}


// GET request
router.route("/").get((req, res) => {
    res.send("Pollinations AI Image Generator");
});

// POST request
router.route("/").post(async (req, res) => {
    try {
        const { prompt, model = 'flux', seed , width = 768, height = 768, enhance = false, nologo = false, privateMode = false , type} = req.body;
        const uniqueId = uuidv4(); // Generate unique identifier
        const randomSeed = seed ? seed : generateSeed(uniqueId);
        let imageUrl;


    if(type === 'text'){
           const textUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${model}&seed=${randomSeed}&json=true&system=You are an advanced AI model`;
        const textResponse = await fetch(textUrl)
        if (!textResponse.ok) {
            throw new Error(`HTTP error! status: ${textResponse.status}`);
          }
        const textData = await textResponse.json();
        if(textData && textData.text){
            return res.status(200).json({ response: textData.text });

        }else{
           return  res.status(500).json({ message: 'Error while generating text' });
        }

    } else if (type === 'image'){
         imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&seed=${randomSeed}&width=${width}&height=${height}&enhance=${enhance}&nologo=${nologo}&private=${privateMode}&code=beesknees`;
        console.log(imageUrl)
    }
    else if (type === 'image_upload'){
        if(!req.files || Object.keys(req.files).length === 0){
            return res.status(400).send("no files were uploaded");
        }

        const imageFile = req.files.image
        const imagePath = path.join(__dirname, `uploads/${uniqueId}${imageFile.name}`)
        await imageFile.mv(imagePath) // move the image to a temp location

        const base64Image = await resizeImage(imagePath)
         const apiPrompt = "Describe the image exactly as you see it including any detected gender and fine details and visual styles used.";
         const requestBody = {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            { "type": "text", "text": apiPrompt },
                            { "type": "image_url", "image_url": { "url": `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    }
                ],
                "model": "openai",
                "jsonMode": false,
                "seed": randomSeed
            };

           const response = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

                const result = await response.text();
                return res.status(200).json({ response : result.trim()});

    }
    else if (type === 'video_upload'){
           if(!req.files || Object.keys(req.files).length === 0){
            return res.status(400).send("no files were uploaded");
        }
    const videoFile = req.files.video
        const videoPath = path.join(__dirname, `uploads/${uniqueId}${videoFile.name}`)
        await videoFile.mv(videoPath) // move the video to a temp location

        const ffmpeg = require('fluent-ffmpeg');
        const frameDir = path.join(__dirname, `uploads/frames_${uniqueId}`);
        const fps =  req.body.fps || 1; //default 1 frame per second
        let frameCount = 0
        // ensure this exists, create it otherwise
        const fs = require('fs')

        if (!fs.existsSync(frameDir)) {
            fs.mkdirSync(frameDir, { recursive: true });
        }


        await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                .outputOptions(['-vf', `fps=${fps}`])
                .on('filenames', function(filenames) {
                    console.log('Will generate ' + filenames.join(', '))
                })
                .on('end', function() {
                    console.log('Screenshots taken');
                     resolve()
                })
                .on('error', function(err) {
                    console.log('An error occurred: ' + err.message);
                    reject(err)
                })
                .save(`${frameDir}/frame-%03d.jpg`);

        })
            fs.readdir(frameDir, async (err, files) => {
                 if (err) {
                    console.error('Error reading directory:', err);
                    return res.status(500).send("Error processing frames");
                 }
                  let base64Images = [];
                  for (const file of files) {
                      const imagePath = path.join(frameDir,file);
                      const base64Image = await resizeImage(imagePath);
                      base64Images.push({ "type": "image_url", "image_url": { "url": `data:image/jpeg;base64,${base64Image}` } });
                  }

             const apiPrompt = "Describe the content of the video and it's key characteristics exactly as you see it including any detected gender, fine details and visual styles used.";
                const requestBody = {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                           { "type": "text", "text": apiPrompt },
                           ...base64Images
                        ]
                    }
                ],
                "model": "openai",
                "jsonMode": false,
                 "seed": randomSeed
            };

            try{
             const response = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

                const result = await response.text();
                return res.status(200).json({ response : result.trim()});

             }
             catch(error){
                   console.error("Error analyzing video:", error);
                 return res.status(500).json({ message: 'Error analyzing video. Please try again.' });
                } finally{

                       fs.rm(frameDir, { recursive: true }, (err) => {
                        if (err) {
                             console.error('Error deleting frame directory:', err);
                        }
                       });
                         fs.unlink(videoPath, (err) => {
                        if (err) {
                            console.error('Error deleting video:', err);
                        }
                    });

                 }


            })
            return


    }
    else {
         return res.status(400).send('Invalid type was provided')
    }

       if(type === 'image'){
            const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            const imageBuffer = await response.arrayBuffer();
            const imageBase64 = Buffer.from(imageBuffer).toString('base64');
           return res.status(200).json({ photo: `data:image/jpeg;base64,${imageBase64}` });
       }


    } catch (error) {
        console.error(error);
        res.status(500).send(error.message );
    }
});


export default router;
