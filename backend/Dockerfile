# backend/Dockerfile

# CHANGE: Use Node 20 (This has the 'File' API built-in)
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg

# Setup Python Virtual Env
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install yt-dlp
RUN pip3 install yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all app files
COPY . .

# Open the port
EXPOSE 3000

# Start the server
CMD ["node", "server.mjs"]
