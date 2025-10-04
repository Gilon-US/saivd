## High Level Requirements

# SAVD App

The SAVD app is a web application that allows logged in users to upload video files and have a "watermarked" version of those videos created and stored in the cloud.
The user also has the ability to get a public URL to their watermarked video. The user can also delete their video and the watermarked version.
Users see a thumbnail view of all of their uploaded video files as well as the thumbnail of the watermarked version of the video.
The videos are side by side in a grid view. When a video is initially uploaded, it does not have a watermarked version. The users sees a placeholder image with a "create watermarked version" button.
When the user clicks the button, the watermarked version is created and the placeholder image is replaced with the thumbnail of the watermarked version.
There can only be one watermarked version for each video.
The user can delete the watermarked version video and see the "create watermarked version" to recreate the watermarked version.
The watermarked version is created by making an API call to an external service that returns a URL to the watermarked version.
The URL is then stored in the database and the thumbnail is displayed in the grid view. Users may have many videos, each with a single watermarked version.
All video metadata is stored in the postgres database. The database tracks the original video file URL, the watermarked version of the video file URL, as well as userID timestamps for when the video was uploaded and when the watermarked version was created.
Users can only see their own videos and watermarked versions. The external watermark service requires a token to be passed in the header of the API call.
The external watermarking service is asynchronous and requires a callback URL to notify the SAVD app when the watermarked version is ready. The SAVD app will then update the database with the URL to the watermarked version and the thumbnail will be displayed in the grid view.
The SAVD app will also update the database with the URL to the watermarked version when the callback is received. The SAVD app will use Next.JS and Supabase for the frontend and backend respectively.
It should leverage the Supabase Auth service for user authentication and authorization. Since it will need to use pre-signed URLs to upload files to Wasabi, it should leverage Next.JS's API routes to handle the file uploads. The API routes will upload the files to Wasabi and return a URL to the uploaded file.
The SAVD app will not use the Supabase file storage service for storing the video files. The SAVD app will use Wasabi for storing the video files.
Supabase may be leveraged to provide the callback URL for the external watermarking service. Use shadcn ui for the frontend. Use Tailwind CSS for styling.
It should be a simple and clean iterface that focuses on the main functionality of the app. The app should be responsive and mobile friendly.
The app should be deployed using docker and docker compose.
