# backend/Dockerfile

# 1. Start with a lightweight Linux system that has Node.js 18 installed
FROM node:18-alpine

# 2. Install the tools we need (Python, Pip, FFmpeg)
RUN apk add --no-cache python3 py3-pip ffmpeg

# 3. Create a virtual environment for Python (Recommended for newer Linux versions)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 4. Install yt-dlp using Pip
RUN pip3 install yt-dlp

# 5. Create a folder inside the box for our app
WORKDIR /app

# 6. Copy our package files first (for better caching)
COPY package*.json ./

# 7. Install our Node.js dependencies
RUN npm install

# 8. Copy the rest of our backend code into the box
COPY . .

# 9. Open port 3000
EXPOSE 3000

# 10. Start the server
CMD ["npm run dev"]
