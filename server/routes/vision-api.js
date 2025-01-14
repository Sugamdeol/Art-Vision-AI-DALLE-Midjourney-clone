import express from "express";
import * as dotenv from "dotenv";
import fetch from "node-fetch";
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import sharp from 'sharp';


dotenv.config();

const router = express.Router();


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

// POST request
router.route("/").post(async (req, res) => {
    // Log the start of the image analysis process
    console.log("Starting the image analysis API call");

    // Extract base64 image, custom prompt, detail level, and max tokens from request body
    const {
        file: base64Image,
        prompt: customPrompt,
         seed,
    } = req.body;
    const uniqueId = uuidv4();
    const randomSeed = seed ? seed : generateSeed(uniqueId);

    // Check if a base64 image was provided
    if (!base64Image) {
        console.error("No file found in the request");
        return res.status(400).json({ success: false, message: "No file found" });
    }

    // Log the receipt of the image in base64 format
    console.log("Received image in base64 format");


    // Use the custom prompt or a default if not provided.
     const promptText =
        customPrompt ||
        "Analyze and describe the image in detail. Focus on visual elements like colors, object details, people's positions and expressions, and the environment. Transcribe any text as 'Content: “[Text]”', noting font attributes. Aim for a clear, thorough representation of all visual and textual aspects.";


    // Log the chosen prompt
    console.log(`Using prompt: ${promptText}`);


    // Prepare request body for the Pollinations text API with image
    const requestBody = {
        "messages": [
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": promptText },
                    { "type": "image_url", "image_url": { "url": base64Image } }
                ]
            }
        ],
        "model": "openai",
        "jsonMode": false,
        "seed": randomSeed
    };


    // Log that we're sending a request to Pollinations
    console.log("Sending request to Pollinations Text API with image");

    try {
        // Send POST request to Pollinations API for text generation
        const response = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });


        // Check if the response is OK, if not throw an error
          if (!response.ok) {
              const errorText = await response.text();
              console.error("Pollinations API error:", response.status, errorText);
              throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);

          }


        // Get the response text from the api
        const result = await response.text();
         // Log the response from Pollinations
        console.log("Received response from Pollinations Text API");

        // Return the text result
        return res.status(200).json({ success: true, analysis: result.trim() });

    } catch (error) {
        // Log and return errors
        console.error("Error during Pollinations API request:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});


export default router;
